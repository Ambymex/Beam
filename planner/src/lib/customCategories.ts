// User-created categories (§6). The built-in 15 (categories.ts) are a static
// base; these layer on top. A custom category holds no member list of its own —
// its members are simply the custom vibes whose categoryId points at it — so
// there's one source of truth and nothing to keep in sync.

import { writable } from 'svelte/store';
import { db } from './db';

export interface CustomCategory {
  id: string; // 'cat:custom:<rand>'
  label: string;
  icon: string; // an emoji glyph (not a meaningful hue)
}

export const customCategories = writable<CustomCategory[]>([]);

// Sync mirror for the pure resolver / category lookups.
export const CUSTOM_CATS_BY_ID: Record<string, CustomCategory> = {};

customCategories.subscribe((list) => {
  for (const k of Object.keys(CUSTOM_CATS_BY_ID)) delete CUSTOM_CATS_BY_ID[k];
  for (const c of list) CUSTOM_CATS_BY_ID[c.id] = c;
});

async function initCustomCategories() {
  if (typeof window === 'undefined') return;
  try {
    const list = await db.customCategories.toArray();
    customCategories.set(list);
  } catch (err) {
    console.error('[DB] Failed to load custom categories:', err);
  }
}

// Start loading immediately in the background
initCustomCategories();

export function addCustomCategory(label: string): CustomCategory {
  const cat: CustomCategory = {
    id: 'cat:custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label: label.trim() || 'My category',
    icon: '',
  };
  customCategories.update((list) => [...list, cat]);
  db.customCategories.put(cat).catch((err) => console.error('[DB] Failed to add custom category:', err));
  return cat;
}

export function removeCustomCategory(id: string) {
  customCategories.update((list) => list.filter((c) => c.id !== id));
  db.customCategories.delete(id).catch((err) => console.error('[DB] Failed to delete custom category:', err));
}
