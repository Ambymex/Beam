// User-created categories (§6). The built-in 15 (categories.ts) are a static
// base; these layer on top. A custom category holds no member list of its own —
// its members are simply the custom vibes whose categoryId points at it — so
// there's one source of truth and nothing to keep in sync.

import { writable } from 'svelte/store';

export interface CustomCategory {
  id: string; // 'cat:custom:<rand>'
  label: string;
  icon: string; // an emoji glyph (not a meaningful hue)
}

const STORAGE_KEY = 'radial-planner-custom-cats-v1';

function load(): CustomCategory[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomCategory[]) : [];
  } catch {
    return [];
  }
}

export const customCategories = writable<CustomCategory[]>(load());

// Sync mirror for the pure resolver / category lookups.
export const CUSTOM_CATS_BY_ID: Record<string, CustomCategory> = Object.fromEntries(
  load().map((c) => [c.id, c]),
);

customCategories.subscribe((list) => {
  for (const k of Object.keys(CUSTOM_CATS_BY_ID)) delete CUSTOM_CATS_BY_ID[k];
  for (const c of list) CUSTOM_CATS_BY_ID[c.id] = c;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
});

export function addCustomCategory(label: string, icon: string): CustomCategory {
  const cat: CustomCategory = {
    id: 'cat:custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label: label.trim() || 'My category',
    icon: icon.trim() || '✦',
  };
  customCategories.update((list) => [...list, cat]);
  return cat;
}

export function removeCustomCategory(id: string) {
  customCategories.update((list) => list.filter((c) => c.id !== id));
}
