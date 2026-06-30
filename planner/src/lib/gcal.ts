import { writable, get } from 'svelte/store';
import { db } from './db';
import { VIBES } from './vibes';
import { customVibes } from './customVibes';
import type { Block } from './blocks';

// Track if Google Calendar sync is active
export const gcalSyncActive = writable<boolean>(
  typeof localStorage !== 'undefined' ? localStorage.getItem('radial-planner-gcal-active') === 'true' : false
);

let tokenClient: any = null;

// Initialize Google OAuth client
export function initGCalClient() {
  if (typeof window === 'undefined' || !(window as any).google) return;
  const clientID = import.meta.env.VITE_GCAL_CLIENT_ID || '';
  if (!clientID) {
    console.warn('[GCal] VITE_GCAL_CLIENT_ID is not configured in .env file.');
    return;
  }

  try {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error) {
          console.error('[GCal] OAuth authentication error:', tokenResponse.error);
          return;
        }

        const expiry = Date.now() + Number(tokenResponse.expires_in) * 1000;
        localStorage.setItem('radial-planner-gcal-token', tokenResponse.access_token);
        localStorage.setItem('radial-planner-gcal-expiry', String(expiry));
        localStorage.setItem('radial-planner-gcal-active', 'true');
        gcalSyncActive.set(true);

        console.log('[GCal] Authenticated successfully!');
        
        // Trigger initial sync for current page view
        const daysMod = await import('./days');
        const activeKey = get(daysMod.currentKey);
        await syncCalendarDay(activeKey);
      }
    });
  } catch (err) {
    console.error('[GCal] Failed to initialize token client:', err);
  }
}

// Request access token via popup
export function connectGCal() {
  if (!tokenClient) initGCalClient();
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: '' });
  } else {
    alert('Google Identity Services client library is still loading. Please wait a second and try again.');
  }
}

// Disconnect OAuth sync
export function disconnectGCal() {
  localStorage.removeItem('radial-planner-gcal-token');
  localStorage.removeItem('radial-planner-gcal-expiry');
  localStorage.setItem('radial-planner-gcal-active', 'false');
  gcalSyncActive.set(false);
}

// Get clean, unexpired access token
export function getGCalToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const token = localStorage.getItem('radial-planner-gcal-token');
  const expiryStr = localStorage.getItem('radial-planner-gcal-expiry');
  if (!token || !expiryStr) return null;

  const expiry = Number(expiryStr);
  if (Date.now() >= expiry - 60000) { // expires in less than 1 minute
    return null;
  }
  return token;
}

// Helper to convert GCal event time to decimal hours
function parseISOToHours(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() + d.getMinutes() / 60;
}

// Helper to convert decimal hours to local timezone ISO strings
function decimalHoursToISO(dateStr: string, decimalHours: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMins = Math.round(decimalHours * 60);
  const hh = Math.floor(totalMins / 60) % 24;
  const mm = totalMins % 60;
  const date = new Date(y, m - 1, d, hh, mm, 0);
  return date.toISOString();
}

// Fuzzy match event titles to synesthetic vibe palettes
function autoMatchVibe(summary: string): string | null {
  if (!summary) return null;
  const clean = summary.toLowerCase();
  
  let allVibes: any[] = [];
  customVibes.subscribe(v => {
    allVibes = [...VIBES, ...v];
  })();

  for (const v of allVibes) {
    if (v.emotion && clean.includes(v.emotion.toLowerCase())) {
      return v.id;
    }
  }
  return null;
}

// Mirror Sync: Fetch events from Google and overlay them onto IndexedDB planner blocks
export async function syncCalendarDay(dateStr: string) {
  if (!get(gcalSyncActive)) return;
  const token = getGCalToken();
  if (!token) {
    console.warn('[GCal] Token expired or missing. Connect Google Calendar again.');
    return;
  }

  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const timeMin = new Date(y, m - 1, d, 0, 0, 0).toISOString();
    const timeMax = new Date(y, m - 1, d, 23, 59, 59).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (res.status === 401) {
      console.warn('[GCal] Unauthorized query. Expiring local token.');
      disconnectGCal();
      return;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const gcalEvents = data.items || [];

    const daysMod = await import('./days');
    const store = get(daysMod.days);
    const dayData = store[dateStr] ?? { blocks: [], symptoms: [], nextId: 1, nextSymptomId: 1 };
    
    const localBlocks = [...dayData.blocks];
    let nextId = dayData.nextId;
    let mutated = false;

    // Track active Google Calendar IDs in this response to clean up deletions
    const activeGCalIds = new Set<string>();

    for (const event of gcalEvents) {
      if (event.status === 'cancelled') continue;
      
      activeGCalIds.add(event.id);

      const startISO = event.start.dateTime || (event.start.date ? `${event.start.date}T00:00:00` : null);
      const endISO = event.end.dateTime || (event.end.date ? `${event.end.date}T23:59:59` : null);
      if (!startISO || !endISO) continue;

      const startHours = event.start.date ? 0 : parseISOToHours(startISO);
      const coreEndHours = event.end.date ? 24 : parseISOToHours(endISO);
      const label = event.summary || 'Google Event';

      const existingIdx = localBlocks.findIndex(b => b.gcalId === event.id);

      if (existingIdx !== -1) {
        const existing = localBlocks[existingIdx];
        const timeDiff = Math.abs(existing.startHours - startHours) > 0.01 || Math.abs(existing.coreEndHours - coreEndHours) > 0.01;
        const titleDiff = existing.label !== label;
        
        if (timeDiff || titleDiff) {
          localBlocks[existingIdx] = {
            ...existing,
            startHours,
            coreEndHours,
            taperEndHours: coreEndHours,
            label
          };
          mutated = true;
        }
      } else {
        // Create new imported block
        const newBlock: Block = {
          id: nextId++,
          laneId: 'main',
          startHours,
          coreEndHours,
          taperEndHours: coreEndHours,
          vibeId: autoMatchVibe(label), // Auto-matches category if found
          done: false,
          label,
          kind: 'appointment',
          gcalId: event.id
        };
        localBlocks.push(newBlock);
        mutated = true;
      }
    }

    // Delete any local blocks referencing a gcalId that no longer exists on Google
    const filteredBlocks = localBlocks.filter(b => {
      if (b.gcalId && !activeGCalIds.has(b.gcalId)) {
        mutated = true;
        return false;
      }
      return true;
    });

    if (mutated) {
      daysMod.days.update(all => ({
        ...all,
        [dateStr]: {
          ...dayData,
          blocks: filteredBlocks,
          nextId
        }
      }));
    }
  } catch (err) {
    console.error('[GCal] Sync failed:', err);
  }
}

// Push local block changes up to Google Calendar
export async function pushLocalBlockToGCal(block: Block, dateStr: string): Promise<string | null> {
  const token = getGCalToken();
  if (!token) return null;

  // We only sync blocks on the main lane that have a label and are not emotions
  if (block.laneId !== 'main' || !block.label) return null;

  const url = block.gcalId 
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${block.gcalId}`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    
  const method = block.gcalId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: block.label,
        description: 'Scheduled via Radial Day Planner',
        start: { dateTime: decimalHoursToISO(dateStr, block.startHours) },
        end: { dateTime: decimalHoursToISO(dateStr, block.coreEndHours) }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[GCal] Write failed:', res.status, err);
      return null;
    }

    const event = await res.json();
    return event.id; // Returns GCal ID
  } catch (err) {
    console.error('[GCal] Push error:', err);
    return null;
  }
}

// Delete an event on Google Calendar
export async function deleteGCalEvent(gcalId: string) {
  const token = getGCalToken();
  if (!token) return;

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.text();
      console.error('[GCal] Delete failed:', res.status, err);
    }
  } catch (err) {
    console.error('[GCal] Delete error:', err);
  }
}

// Initialize client library once page is ready
if (typeof window !== 'undefined') {
  if ((window as any).google) {
    initGCalClient();
  } else {
    const poll = setInterval(() => {
      if ((window as any).google) {
        clearInterval(poll);
        initGCalClient();
      }
    }, 200);
    // Timeout polling after 15 seconds
    setTimeout(() => clearInterval(poll), 15000);
  }
}
