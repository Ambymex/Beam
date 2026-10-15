// 🐟 2D Fish Studio — Persisted Drafts Store

import { writable } from 'svelte/store';
import type { FishConfig } from './fishConfig';
import { migrateFishConfig } from './fishConfig';

const KEY = 'fish-studio-drafts';

function load(): Record<string, FishConfig> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out: Record<string, FishConfig> = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = migrateFishConfig(v);
    }
    return out;
  } catch {
    return {};
  }
}

export const fishDrafts = writable<Record<string, FishConfig>>(load());

fishDrafts.subscribe((d) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode / quota */
  }
});

export function saveFishDraft(name: string, cfg: FishConfig): void {
  fishDrafts.update((d) => ({
    ...d,
    [name]: JSON.parse(JSON.stringify(cfg)),
  }));
}

export function deleteFishDraft(name: string): void {
  fishDrafts.update((d) => {
    const copy = { ...d };
    delete copy[name];
    return copy;
  });
}
