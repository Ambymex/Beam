// The untimed capture list (spec §6) — the margin "to get: cat, milk, emergency
// bag" zone from the paper system. A non-temporal ADHD capture surface: things
// with no time attached. Kept as a single ongoing list (not per-day), persisted
// on its own so it survives reloads independently of the schedule.

import { writable } from 'svelte/store';

export interface CaptureItem {
  id: number;
  text: string;
  done: boolean;
}

const STORAGE_KEY = 'radial-planner-capture-v1';

function load(): CaptureItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CaptureItem[]) : [];
  } catch {
    return [];
  }
}

export const capture = writable<CaptureItem[]>(load());

capture.subscribe((value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode — still works in-memory this session */
  }
});

export function addCapture(text: string) {
  const t = text.trim();
  if (!t) return;
  capture.update((list) => {
    const id = list.reduce((m, i) => Math.max(m, i.id), 0) + 1;
    return [...list, { id, text: t, done: false }];
  });
}

export function toggleCapture(id: number) {
  capture.update((list) => list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
}

export function removeCapture(id: number) {
  capture.update((list) => list.filter((i) => i.id !== id));
}
