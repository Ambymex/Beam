// Export the full vibe database (§6) — the user keeps a master list of all 77+
// for creating things elsewhere. Gathers built-ins + her custom vibes and
// categories into both a portable JSON (re-importable) and a flat readable text
// list (hex + emotion + category), and triggers a download.

import { VIBES } from './vibes';
import { CUSTOM_BY_ID, type CustomVibe } from './customVibes';
import { CUSTOM_CATS_BY_ID } from './customCategories';
import { BASE_CATEGORIES, membersOfId } from './categories';

export interface VibeExport {
  exportedAt: string;
  counts: { vibes: number; custom: number; categories: number };
  categories: { id: string; label: string; icon: string; custom: boolean; members: { hex: string; emotion: string; id: string; custom: boolean }[] }[];
  // flat list of every vibe (built-in + custom), for quick reference
  allVibes: { hex: string; emotion: string; id: string; custom: boolean; categoryId?: string }[];
}

export function buildExport(): VibeExport {
  const customList = Object.values(CUSTOM_BY_ID) as CustomVibe[];
  const customCatIds = Object.keys(CUSTOM_CATS_BY_ID);
  const allCatIds = [...BASE_CATEGORIES.map((c) => c.id), ...customCatIds];

  const categories = allCatIds.map((id) => {
    const base = BASE_CATEGORIES.find((c) => c.id === id);
    const meta = base ?? CUSTOM_CATS_BY_ID[id];
    const members = membersOfId(id).map((v) => ({
      hex: v.hex,
      emotion: v.emotion,
      id: v.id,
      custom: v.id.startsWith('custom:'),
    }));
    return { id, label: meta.label, icon: meta.icon, custom: !base, members };
  });

  const allVibes = [
    ...VIBES.map((v) => ({ hex: v.hex, emotion: v.emotion, id: v.id, custom: false })),
    ...customList.map((v) => ({ hex: v.hex, emotion: v.emotion, id: v.id, custom: true, categoryId: v.categoryId })),
  ];

  return {
    exportedAt: new Date().toISOString(),
    counts: { vibes: VIBES.length, custom: customList.length, categories: allCatIds.length },
    categories,
    allVibes,
  };
}

// A flat, human-readable text master list grouped by category.
export function buildTextList(): string {
  const data = buildExport();
  const lines: string[] = [];
  lines.push(`Vibe master list — ${data.allVibes.length} vibes across ${data.counts.categories} categories`);
  lines.push(`exported ${data.exportedAt}`);
  lines.push('');
  for (const cat of data.categories) {
    lines.push(`${cat.icon} ${cat.label}${cat.custom ? ' (custom)' : ''}`);
    for (const m of cat.members) {
      lines.push(`  ${m.hex}  ${m.emotion}${m.custom ? '  *' : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function download(filename: string, text: string, type: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function downloadJSON() {
  download(`vibes-${stamp()}.json`, JSON.stringify(buildExport(), null, 2), 'application/json');
}

export function downloadText() {
  download(`vibes-${stamp()}.txt`, buildTextList(), 'text/plain');
}

// Copy the text list to the clipboard (handy on mobile). Returns success.
export async function copyTextList(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildTextList());
    return true;
  } catch {
    return false;
  }
}
