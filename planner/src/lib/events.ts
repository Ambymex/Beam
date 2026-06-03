// Transition-event extraction for the push spine (§7). Pure + svelte-free so it
// can be unit-tested and reused client-side (to upload) and conceptually mirror
// what the server fires.
//
// What we notify on — TRANSITIONS ONLY (§7):
//   • block-start    — a block's confident core begins
//   • appliance-free — a washer/dryer cycle ENDS ("dryer's free, go") — the
//                      whole appliance-Jenga payoff, high priority
//   • travel-start   — for an appointment, fire at the DEPARTURE edge
//                      ("leave now"), never the appointment time
// We NEVER notify on an undone task; it migrates silently (§5/§13). There is
// deliberately no such event kind.

import type { Block } from './blocks';
import { isAppointment, departureHours } from './blocks';
import { parseKey } from './daydata';
import { resolveVibe } from './categories';

export type TransitionKind = 'block-start' | 'appliance-free' | 'travel-start';

export interface TransitionEvent {
  // stable id so re-uploads upsert rather than duplicate: day + block + kind
  key: string;
  fireAt: string; // ISO timestamp (absolute moment the ping should send)
  kind: TransitionKind;
  title: string;
  body: string;
  vibeId: string | null;
}

const APPLIANCE_LANES = new Set(['washer', 'dryer']);

// Convert an hours-from-local-midnight value on a given day into an absolute
// Date. Hours may exceed 24 (cross-midnight blocks) — handled by date math.
function momentOf(dayKey: string, hours: number): Date {
  const base = parseKey(dayKey); // local midnight of that day
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + Math.round(hours * 60));
  return d;
}

function laneLabel(laneId: string): string {
  if (laneId === 'washer') return 'Washing machine';
  if (laneId === 'dryer') return 'Dryer';
  return '';
}

// Extract every transition event for one day's blocks. `now` lets callers drop
// past events; pass epoch 0 to keep them all (tests).
export function eventsForDay(dayKey: string, blocks: Block[]): TransitionEvent[] {
  const out: TransitionEvent[] = [];
  for (const b of blocks) {
    if (b.done) continue; // done = no ping (and undone never nags either way)
    const label = b.label?.trim();

    if (isAppointment(b)) {
      // the load-bearing ping: leave-now at the departure edge
      const dep = departureHours(b);
      out.push({
        key: `${dayKey}:${b.id}:travel-start`,
        fireAt: momentOf(dayKey, dep).toISOString(),
        kind: 'travel-start',
        title: 'Time to leave',
        body: label ? `Head out now for ${label}.` : 'Head out now to make it.',
        vibeId: b.vibeId,
      });
      continue; // appointments don't also fire a generic block-start
    }

    if (APPLIANCE_LANES.has(b.laneId)) {
      // appliance cycle ENDING — fire at coreEnd ("it's free now")
      out.push({
        key: `${dayKey}:${b.id}:appliance-free`,
        fireAt: momentOf(dayKey, b.coreEndHours).toISOString(),
        kind: 'appliance-free',
        title: `${laneLabel(b.laneId)} is free`,
        body: 'Cycle done — go switch it over.',
        vibeId: b.vibeId,
      });
      continue;
    }

    // ordinary block — fire at its start
    const vibe = b.vibeId ? resolveVibe(b.vibeId) : null;
    out.push({
      key: `${dayKey}:${b.id}:block-start`,
      fireAt: momentOf(dayKey, b.startHours).toISOString(),
      kind: 'block-start',
      title: label || 'Starting now',
      body: label
        ? 'Time to start.'
        : vibe?.emotion
          ? `Starting now: ${vibe.emotion}`
          : 'A block is starting.',
      vibeId: b.vibeId,
    });
  }
  return out;
}

// Flatten a DaysMap-ish into upcoming events from `now` forward, sorted.
export function upcomingEvents(
  days: Record<string, { blocks: Block[] }>,
  now: Date,
  horizonDays = 3,
): TransitionEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86400000);
  const all: TransitionEvent[] = [];
  for (const [key, day] of Object.entries(days)) {
    for (const ev of eventsForDay(key, day.blocks)) {
      const t = new Date(ev.fireAt);
      if (t >= now && t <= horizon) all.push(ev);
    }
  }
  all.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
  return all;
}
