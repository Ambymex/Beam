// User-created vibes (§4/§6). The original 77 came from the user reacting to
// colours GPT threw at them — this lets her keep doing exactly that: pick a hue,
// name what it feels like, and (now) file it under a category.
//
// This does NOT violate "no invented hues" (§2): the rule is that the APP must
// never fabricate a meaningful colour. The USER choosing and naming one is how
// the whole DB was built in the first place — her synesthetic language, extended.

import { writable } from 'svelte/store';
import type { Vibe } from './vibes';

// A custom vibe is a Vibe plus which category it belongs to (a base id like
// 'cat:cooking' or a custom 'cat:custom:*'; undefined = uncategorised → "yours").
export type CustomVibe = Vibe & { categoryId?: string };

const STORAGE_KEY = 'radial-planner-custom-vibes-v1';

function load(): CustomVibe[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomVibe[]) : [];
  } catch {
    return [];
  }
}

export const customVibes = writable<CustomVibe[]>(load());

// A synchronous mirror so the pure resolveVibe() (categories.ts) can look custom
// vibes up without being async or a store consumer.
export const CUSTOM_BY_ID: Record<string, CustomVibe> = Object.fromEntries(
  load().map((v) => [v.id, v]),
);

customVibes.subscribe((list) => {
  for (const k of Object.keys(CUSTOM_BY_ID)) delete CUSTOM_BY_ID[k];
  for (const v of list) CUSTOM_BY_ID[v.id] = v;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — still works in-memory */
  }
});

function normHex(hex: string): string {
  let h = hex.trim().toLowerCase();
  if (!h.startsWith('#')) h = '#' + h;
  return h;
}

// Create + persist a new vibe, optionally filed under a category. Returns it.
export function addCustomVibe(hex: string, emotion: string, categoryId?: string): CustomVibe {
  const vibe: CustomVibe = {
    id: 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    hex: normHex(hex),
    emotion: emotion.trim() || 'a vibe of mine',
    categoryId: categoryId || undefined,
  };
  customVibes.update((list) => [...list, vibe]);
  return vibe;
}

export function removeCustomVibe(id: string) {
  customVibes.update((list) => list.filter((v) => v.id !== id));
}

// Re-file a custom vibe under a (different) category, or uncategorise it.
export function setVibeCategory(id: string, categoryId: string | undefined) {
  customVibes.update((list) =>
    list.map((v) => (v.id === id ? { ...v, categoryId: categoryId || undefined } : v)),
  );
}
