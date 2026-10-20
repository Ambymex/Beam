import { pipeline, env } from '@xenova/transformers';

// Configure transformers to load ONNX models from Hugging Face CDN in browser environments
env.allowLocalModels = false;

let embedderPromise: any = null;

async function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedderPromise;
}

/**
 * Computes a 384-dimensional dense vector embedding for a given text.
 * Runs 100% client-side via WebAssembly.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const embedder = await getEmbedder();
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data) as number[];
  } catch (err) {
    console.error('[Vault] Embedding generation failed:', err);
    throw new Error('Failed to generate vector embedding.');
  }
}

interface PineconeMatch {
  id: string;
  score: number;
  metadata?: {
    text?: string;
    timestamp?: string;
  };
}

/**
 * Queries Pinecone for semantically relevant historical context.
 */
export async function fetchContext(query: string, apiKey: string, indexHost: string, k = 4): Promise<string> {
  if (!apiKey || !indexHost || !query.trim()) return '';

  try {
    const cleanHost = indexHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanHost}/query`;
    
    // 1. Generate query embedding
    const queryEmbedding = await embedText(query);

    // 2. Query Pinecone via HTTP
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        topK: k,
        includeMetadata: true
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinecone query error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const matches: PineconeMatch[] = data.matches || [];

    if (matches.length === 0) return '';

    // Extract text blocks from metadata, filtering out low scores (e.g. < 0.35) if needed
    const fragments = matches
      .filter((m) => m.metadata && m.metadata.text && m.score > 0.4)
      .map((m) => m.metadata!.text);

    return fragments.join('\n\n---\n\n');
  } catch (err) {
    console.warn('[Vault] Failed to retrieve context from Pinecone:', err);
    return ''; // Fallback to empty context so app continues
  }
}

/**
 * Upserts a chat exchange to Pinecone.
 */
export async function injectMemory(
  userInput: string,
  assistantResponse: string,
  apiKey: string,
  indexHost: string
): Promise<string | null> {
  if (!apiKey || !indexHost || !userInput.trim() || !assistantResponse.trim()) return null;

  try {
    const cleanHost = indexHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanHost}/vectors/upsert`;
    
    const docId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const exchangeText = `User: ${userInput}\nAssistant: ${assistantResponse}`;

    // 1. Generate text embedding
    const embedding = await embedText(exchangeText);

    // 2. Upsert to Pinecone via HTTP
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vectors: [{
          id: docId,
          values: embedding,
          metadata: {
            text: exchangeText,
            timestamp: timestamp
          }
        }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinecone upsert error: ${res.status} ${errText}`);
    }

    console.log(`[Vault] Successfully upserted memory exchange ${docId} to Pinecone.`);
    return docId;
  } catch (err) {
    console.error('[Vault] Failed to save memory to Pinecone:', err);
    return null;
  }
}

/**
 * Simple deterministic FNV-1a 32-bit hash for diary chunk IDs so identical
 * diary entries map to the same vector ID without duplicating on re-sync.
 */
function hashDiaryChunk(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Splits a day's diary text into discrete entries/reflections.
 * Primary delimiter is horizontal rules (`---`) added between Companion
 * Reflections; if a long day has no `---` separators, falls back to paragraph blocks.
 */
export function splitDiaryEntries(diary: string): string[] {
  const trimmed = (diary || '').trim();
  if (!trimmed) return [];
  const byRule = trimmed
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (byRule.length > 1) return byRule;
  const byPara = trimmed
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return byPara;
}

/**
 * Formats only the last `maxEntries` (default 3) entries of a day's diary
 * for prompt injection, keeping the active prompt lean while older entries
 * live in the Pinecone vector vault.
 */
export function formatRecentDiaryEntries(diary: string, maxEntries = 3): string {
  const entries = splitDiaryEntries(diary);
  if (entries.length === 0) return 'No diary entry logged for this day yet.';
  if (entries.length <= maxEntries) {
    const joined = entries.join('\n\n---\n\n');
    return joined.length > 3500 ? '…(earlier content trimmed)\n' + joined.slice(-3500) : joined;
  }
  const omitted = entries.length - maxEntries;
  const recent = entries.slice(-maxEntries).join('\n\n---\n\n');
  const capped = recent.length > 3500 ? '…(earlier content trimmed)\n' + recent.slice(-3500) : recent;
  return `*(Showing the last ${maxEntries} of ${entries.length} diary entries for this day — ${omitted} earlier ${omitted === 1 ? 'entry is' : 'entries are'} indexed in your Pinecone vault)*\n\n${capped}`;
}

/**
 * Extracts a Daily Summary / Ledger from a day's data:
 * 1. Explicit `day.ledger` if stored
 * 2. Any diary block marked as `*Daily Summary / Ledger...*` or `# Daily Summary` / `Daily Ledger`
 * 3. Fallback for legacy days before ledgers existed: the final entry of the day (or a clean 350-char tail excerpt).
 */
export function extractDailyLedger(day: { diary?: string; ledger?: string } | undefined): { text: string; isLedger: boolean } | null {
  if (!day) return null;
  if (day.ledger && day.ledger.trim()) {
    return { text: day.ledger.trim(), isLedger: true };
  }
  const diary = (day.diary || '').trim();
  if (!diary) return null;

  const entries = splitDiaryEntries(diary);
  // Look from latest to earliest for an explicit Daily Summary / Ledger block
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (/(?:daily\s+summary|daily\s+ledger|end[-\s]of[-\s]day\s+ledger)/i.test(entry)) {
      const cleaned = entry
        .replace(/^\*?Daily Summary\s*\/?\s*Ledger(?:\s*\([^)]*\))?:?\*?\s*/i, '')
        .replace(/^\*?Companion Reflection(?:\s*\([^)]*\))?:?\*?\s*/i, '')
        .trim();
      return { text: cleaned || entry, isLedger: true };
    }
  }

  // Legacy fallback: use the last entry of that day rather than a truncated morning excerpt
  const lastEntry = entries[entries.length - 1] || diary;
  const flat = lastEntry.replace(/\n+/g, ' ').trim();
  return {
    text: flat.length > 350 ? flat.slice(0, 350) + '…' : flat,
    isLedger: false
  };
}

/**
 * Upserts a single diary entry or daily summary/ledger into Pinecone.
 * Uses a deterministic ID (`diary_${date}_${hash}` or `ledger_${date}`) so
 * re-indexing is idempotent and never creates duplicate vectors.
 */
export async function upsertDiaryEntry(
  date: string,
  entryText: string,
  apiKey: string,
  indexHost: string,
  kind: 'diary' | 'ledger' = 'diary'
): Promise<string | null> {
  const cleanText = (entryText || '').trim();
  if (!apiKey || !indexHost || !cleanText) return null;

  try {
    const cleanHost = indexHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanHost}/vectors/upsert`;

    const docId = kind === 'ledger'
      ? `ledger_${date}`
      : `diary_${date}_${hashDiaryChunk(cleanText)}`;
    const timestamp = new Date().toISOString();
    const label = kind === 'ledger' ? `Daily Summary / Ledger (${date})` : `Diary Entry (${date})`;
    const formattedText = `[${label}]\n${cleanText}`;

    const embedding = await embedText(formattedText);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vectors: [{
          id: docId,
          values: embedding,
          metadata: {
            text: formattedText,
            date,
            kind,
            timestamp
          }
        }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinecone diary upsert error: ${res.status} ${errText}`);
    }

    console.log(`[Vault] Upserted ${kind} vector ${docId} to Pinecone.`);
    return docId;
  } catch (err) {
    console.error(`[Vault] Failed to upsert ${kind} entry to Pinecone:`, err);
    return null;
  }
}

const INDEXED_DIARY_STORAGE_KEY = 'radial-planner-diary-indexed-v1';

function loadIndexedHashes(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(INDEXED_DIARY_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveIndexedHashes(set: Set<string>) {
  try {
    if (typeof localStorage === 'undefined') return;
    // Keep last 2000 hashes max so localStorage stays tiny
    const arr = Array.from(set).slice(-2000);
    localStorage.setItem(INDEXED_DIARY_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore storage errors
  }
}

let syncInFlight = false;

/**
 * Ensures all discrete diary entries and daily ledgers across `daysMap` are
 * indexed in Pinecone. Tracks indexed vector IDs in localStorage so only
 * brand-new or edited entries are embedded and uploaded.
 */
export async function syncAllDiariesToVault(
  daysMap: Record<string, { diary?: string; ledger?: string }>,
  apiKey: string,
  indexHost: string
): Promise<number> {
  if (!apiKey || !indexHost || syncInFlight) return 0;
  syncInFlight = true;
  let count = 0;

  try {
    const indexed = loadIndexedHashes();
    const dates = Object.keys(daysMap).sort();

    for (const date of dates) {
      const day = daysMap[date];
      if (!day) continue;

      // 1. Index discrete diary entries
      const entries = splitDiaryEntries(day.diary || '');
      for (const entry of entries) {
        if (entry.length < 15) continue; // skip tiny fragments
        const chunkKey = `diary_${date}_${hashDiaryChunk(entry)}`;
        if (indexed.has(chunkKey)) continue;

        const id = await upsertDiaryEntry(date, entry, apiKey, indexHost, 'diary');
        if (id) {
          indexed.add(chunkKey);
          saveIndexedHashes(indexed);
          count++;
        }
      }

      // 2. Index explicit daily ledger if present
      if (day.ledger && day.ledger.trim().length >= 15) {
        const ledgerText = day.ledger.trim();
        const ledgerKey = `ledger_${date}_${hashDiaryChunk(ledgerText)}`;
        if (!indexed.has(ledgerKey)) {
          const id = await upsertDiaryEntry(date, ledgerText, apiKey, indexHost, 'ledger');
          if (id) {
            indexed.add(ledgerKey);
            saveIndexedHashes(indexed);
            count++;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Vault] Background diary sync error:', err);
  } finally {
    syncInFlight = false;
  }

  return count;
}

