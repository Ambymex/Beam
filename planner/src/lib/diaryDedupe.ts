// Diary duplication defence.
//
// The companion's update_diary action is supposed to carry ONLY the new entry,
// but LLMs regularly echo the whole existing diary back (it's in their prompt,
// and "update" reads like "replace"). A naive substring guard can't catch
// "old + new" echoes, so entries compound. These helpers compare at paragraph
// granularity on a normalized form that ignores timestamps, markdown
// punctuation, and whitespace drift.

// A paragraph's comparison key: timestamp headers and markdown dressing out,
// whitespace collapsed, case-folded.
function paraKey(p: string): string {
  return p
    .replace(/\*?Companion Reflection \(\d{1,2}:\d{2}\):?\*?/gi, '')
    .replace(/[*_#>`~[\]()\-—|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitParas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Only paragraphs with enough substance participate in dedupe — a short
// legitimate repeat ("Tired again.") shouldn't be silently swallowed.
const MIN_KEY_LEN = 12;

// Reduce an incoming update_diary payload to the genuinely NEW paragraphs:
// anything already present in the existing diary (in normalized form) is
// dropped. Returns '' when the payload adds nothing.
export function novelDiaryContent(existing: string, incoming: string): string {
  const existingTrim = existing.trim();
  let inc = incoming.trim();
  if (!existingTrim) return inc;
  if (!inc) return '';

  // Fast path: the model echoed the entire diary verbatim with additions —
  // strip the echoed copy outright before paragraph comparison.
  if (inc.includes(existingTrim)) {
    inc = inc.replace(existingTrim, '').trim();
    if (!inc) return '';
  }

  const existingKey = paraKey(existingTrim);
  const kept = splitParas(inc).filter((p) => {
    const key = paraKey(p);
    if (key.length === 0) return false; // orphan header/separator
    if (key.length < MIN_KEY_LEN) return true; // too short to judge — keep
    return !existingKey.includes(key);
  });
  return kept.join('\n\n');
}

// One-shot cleanup for a diary that has already accumulated duplicates:
// keeps the first occurrence of every substantial paragraph, in order.
export function dedupeDiary(text: string): string {
  const seen: string[] = [];
  const kept: string[] = [];
  for (const p of splitParas(text)) {
    const key = paraKey(p);
    if (key.length === 0) continue; // orphan header/separator
    if (key.length >= MIN_KEY_LEN && seen.some((s) => s === key || s.includes(key))) continue;
    seen.push(key);
    kept.push(p);
  }
  return kept.join('\n\n');
}
