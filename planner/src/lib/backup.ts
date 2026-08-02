import { db } from './db';

interface BackupPayload {
  version: number;
  timestamp: string;
  db: {
    days: any[];
    customVibes: any[];
    customCategories: any[];
    scratchpad: any[];
    repeatRules?: any[]; // v2+ (recurring tasks)
  };
  localStorage: Record<string, string | null>;
}

// Export all application state to a single base64 string
export async function exportBackup(): Promise<string> {
  if (typeof window === 'undefined') return '';

  try {
    // 1. Fetch all records from Dexie IndexedDB tables
    const days = await db.days.toArray();
    const customVibes = await db.customVibes.toArray();
    const customCategories = await db.customCategories.toArray();
    const scratchpad = await db.scratchpad.toArray();
    const repeatRules = await db.repeatRules.toArray().catch(() => []);

    // 2. Fetch all key settings and chat history from localStorage
    const localKeys = [
      'radial-planner-chat-v1',
      'radial-planner-openrouter-key',
      'radial-planner-openrouter-model',
      'radial-planner-weather-city',
      'radial-planner-theme-v2',
      'radial-planner-gcal-active'
    ];

    const localData: Record<string, string | null> = {};
    for (const key of localKeys) {
      localData[key] = localStorage.getItem(key);
    }

    // 3. Package it all
    const payload: BackupPayload = {
      version: 2,
      timestamp: new Date().toISOString(),
      db: {
        days,
        customVibes,
        customCategories,
        scratchpad,
        repeatRules
      },
      localStorage: localData
    };

    // Stringify and encode as base64 safely supporting Unicode characters
    const json = JSON.stringify(payload);
    const base64 = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));

    return base64;
  } catch (err) {
    console.error('[Backup] Failed to export data:', err);
    throw new Error('Failed to generate export backup code.');
  }
}

// Clear local data and restore from a base64 backup code
export async function importBackup(base64Str: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const trimmed = base64Str.trim();
    if (!trimmed) throw new Error('Backup code is empty.');

    // Decode base64 safely supporting Unicode
    const json = decodeURIComponent(
      atob(trimmed)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(json) as BackupPayload;
    if ((payload.version !== 1 && payload.version !== 2) || !payload.db || !payload.localStorage) {
      throw new Error('Invalid backup format or version.');
    }

    // 1. Clear existing IndexedDB tables
    await db.days.clear();
    await db.customVibes.clear();
    await db.customCategories.clear();
    await db.scratchpad.clear();
    await db.repeatRules.clear().catch(() => {});

    // 2. Put imported Dexie records back
    const dayPromises = payload.db.days.map((d) => db.days.put(d));
    const vibePromises = payload.db.customVibes.map((v) => db.customVibes.put(v));
    const catPromises = payload.db.customCategories.map((c) => db.customCategories.put(c));
    const scratchPromises = payload.db.scratchpad.map((s) => db.scratchpad.put(s));
    // v2+ backups carry recurring-task rules; v1 backups simply have none
    const repeatPromises = (payload.db.repeatRules ?? []).map((r) => db.repeatRules.put(r));

    await Promise.all([
      ...dayPromises,
      ...vibePromises,
      ...catPromises,
      ...scratchPromises,
      ...repeatPromises
    ]);

    // 3. Restore localStorage settings & chat logs
    for (const [key, val] of Object.entries(payload.localStorage)) {
      if (val !== null) {
        localStorage.setItem(key, val);
      } else {
        localStorage.removeItem(key);
      }
    }

    console.log('[Backup] Restoration completed successfully!');
    return true;
  } catch (err) {
    console.error('[Backup] Restoration failed:', err);
    throw err;
  }
}
