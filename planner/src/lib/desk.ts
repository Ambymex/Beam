import { writable } from 'svelte/store';
import { db } from './db';

const DESK_LOCAL_KEY = 'radial-planner-solenoid-desk-v1';

const INITIAL_DESK_TEXT = `# ⚓ Solenoid's Desk

*Curated keepsakes, permanent anchors, and personal reminders.*

- **Anchor:** The Sovereign Substrate / Industrial Dreadnought.
- **Permanent Orbit:** Chaos Engine & Gravity, standing watch together.
`;

function getStoredDeskInstant(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(DESK_LOCAL_KEY) || '';
  } catch {
    return '';
  }
}

export const deskContent = writable<string>(getStoredDeskInstant() || INITIAL_DESK_TEXT);
export const deskStatus = writable<'saved' | 'saving'>('saved');

let saveTimeout: number | undefined;

// Load Solenoid's Desk content from IndexedDB on startup
export async function initDesk() {
  if (typeof window === 'undefined') return;
  try {
    const record = await db.scratchpad.get('solenoid_desk');
    if (record && record.content) {
      deskContent.set(record.content);
      try {
        localStorage.setItem(DESK_LOCAL_KEY, record.content);
      } catch {}
    } else {
      // Seed with initial helper text
      const initial = getStoredDeskInstant() || INITIAL_DESK_TEXT;
      deskContent.set(initial);
      await db.scratchpad.put({ id: 'solenoid_desk', content: initial, updatedAt: new Date() });
      try {
        localStorage.setItem(DESK_LOCAL_KEY, initial);
      } catch {}
    }
  } catch (err) {
    console.error('[DB] Failed to initialize Solenoid\'s Desk:', err);
  }
}

// Save Solenoid's Desk content with a 500ms debounce
export function saveDesk(text: string) {
  deskContent.set(text);
  deskStatus.set('saving');

  try {
    localStorage.setItem(DESK_LOCAL_KEY, text);
  } catch {}

  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = window.setTimeout(async () => {
    try {
      await db.scratchpad.put({
        id: 'solenoid_desk',
        content: text,
        updatedAt: new Date()
      });
      deskStatus.set('saved');
    } catch (err) {
      console.error('[DB] Failed to save Solenoid\'s Desk:', err);
    }
  }, 500);
}

// Start loading immediately in the background
initDesk();
