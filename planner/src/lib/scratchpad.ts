import { writable } from 'svelte/store';
import { db } from './db';

export const scratchpadContent = writable<string>('');
export const scratchpadStatus = writable<'saved' | 'saving'>('saved');

let saveTimeout: number | undefined;

// Load the scratchpad content from IndexedDB on startup
export async function initScratchpad() {
  if (typeof window === 'undefined') return;
  try {
    const record = await db.scratchpad.get('notes');
    if (record) {
      scratchpadContent.set(record.content);
    } else {
      // Seed with initial helper text
      const initialText = `# 📝 My Scratch Pad\n\nUse this space to write down thoughts, bug observations, or feature ideas during live testing!\n\nYour AI Companion can also read and write to this page. Try telling the companion to *"Add a note about building a weather city selector tab"*!`;
      scratchpadContent.set(initialText);
      await db.scratchpad.put({ id: 'notes', content: initialText, updatedAt: new Date() });
    }
  } catch (err) {
    console.error('[DB] Failed to initialize scratchpad:', err);
  }
}

// Save scratchpad content with a 500ms debounce to prevent database write flooding
export function saveScratchpad(text: string) {
  scratchpadContent.set(text);
  scratchpadStatus.set('saving');

  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = window.setTimeout(async () => {
    try {
      await db.scratchpad.put({
        id: 'notes',
        content: text,
        updatedAt: new Date()
      });
      scratchpadStatus.set('saved');
    } catch (err) {
      console.error('[DB] Failed to save scratchpad:', err);
    }
  }, 500);
}

// Start loading immediately in the background
initScratchpad();
