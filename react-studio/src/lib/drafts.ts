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
  // deep copy — the config is plain JSON, and a shallow copy would leave the
  // saved draft sharing its layers array with the live config being edited
  drafts.update((d) => ({ ...d, [name]: JSON.parse(JSON.stringify(cfg)) }));
}

export function deleteDraft(name: string): void {
  drafts.update((d) => {
    const copy = { ...d };
    delete copy[name];
    return copy;
  });
}
