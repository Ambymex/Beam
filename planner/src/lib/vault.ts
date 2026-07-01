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
