// User-created vibes (§4/§6). The original 77 came from the user reacting to
// colours GPT threw at them — this lets her keep doing exactly that: pick a hue,
// name what it feels like, and it joins her vocabulary.
//
// This does NOT violate "no invented hues" (§2): the rule is that the APP must
// never fabricate a meaningful colour. The USER choosing and naming one is how
// the whole DB was built in the first place — it's her synesthetic language,
// extended. Custom vibes persist on their own key and resolve like any vibe.

import { writable } from 'svelte/store';
import type { Vibe } from './vibes';

const STORAGE_KEY = 'radial-planner-custom-vibes-v1';

function load(): Vibe[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Vibe[]) : [];
  } catch {
    return [];
  }
}

export const customVibes = writable<Vibe[]>(load());

// A synchronous mirror so the pure resolveVibe() (categories.ts) can look custom
// vibes up without being async or a store consumer.
export const CUSTOM_BY_ID: Record<string, Vibe> = Object.fromEntries(load().map((v) => [v.id, v]));

customVibes.subscribe((list) => {
  // keep the sync mirror in lockstep
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

// Create + persist a new vibe; returns it (already armed by the caller).
export function addCustomVibe(hex: string, emotion: string): Vibe {
  const vibe: Vibe = {
    id: 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    hex: normHex(hex),
    emotion: emotion.trim() || 'a vibe of mine',
  };
  customVibes.update((list) => [...list, vibe]);
  return vibe;
}

export function removeCustomVibe(id: string) {
  customVibes.update((list) => list.filter((v) => v.id !== id));
}
