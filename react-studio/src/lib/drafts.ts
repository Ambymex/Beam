// Persisted work-in-progress reacts, so ideas survive a reload / next session.
import { writable } from 'svelte/store';
import type { ReactConfig } from './reactConfig';

const KEY = 'react-studio-drafts';

function load(): Record<string, ReactConfig> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const drafts = writable<Record<string, ReactConfig>>(load());

drafts.subscribe((d) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode / quota — drafts just won't persist */
  }
});

export function saveDraft(name: string, cfg: ReactConfig): void {
  drafts.update((d) => ({ ...d, [name]: { ...cfg } }));
}

export function deleteDraft(name: string): void {
  drafts.update((d) => {
    const copy = { ...d };
    delete copy[name];
    return copy;
  });
}
