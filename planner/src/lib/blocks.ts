// Block model + pure rendering helpers, shared by the live ring and the gallery
// thumbnails. Deliberately svelte-free so it can be unit-tested in isolation.
//
// The taper grammar (§4): a block is solid through its CONFIDENT part
// (start → coreEnd), then fades to nothing across the predicted overage
// (coreEnd → taperEnd). taperEnd === coreEnd is a HARD EDGE — "the world's
// deadline," not mine to estimate. Hours are kept un-wrapped (start in [0,24);
// coreEnd/taperEnd may exceed 24 for a cross-midnight block).

import { hoursToAngle, polar, annularSector } from './geometry';
import { LANES } from './lanes';
import { resolveVibe } from './categories';

export interface Block {
  id: number;
  laneId: string;
  startHours: number;
  coreEndHours: number;
  taperEndHours: number;
  vibeId: string | null;
  done: boolean;
  // A short text header (§6) — the label/index for the block. Colour stays the
  // primary channel; the text is shown only when the block is selected.
  label?: string;
  // Set when a block was carried forward from an earlier day (§13). Banked for
  // a future "this slipped from before" cue; not rendered specially yet.
  migratedFrom?: string;
  // Appointments (§8): externally-fixed, NOT the user's to estimate — so they
  // render hard-edged (taperEnd === coreEnd) and never migrate. They carry
  // asymmetric travel-time wings: a prepend block fading BACKWARD toward
  // "whenever I leave," an append fading OUTWARD toward "whenever I get home."
  kind?: 'appointment';
  travelBeforeHours?: number; // prepend wing length ("leave by" window)
  travelAfterHours?: number; // append wing length ("get home" window)
}

export const SIZE = 400;
export const C = SIZE / 2; // centre of the 400×400 viewBox
export const NEUTRAL = '#6a6a78'; // placeholder fill when no vibe is set
export const HARD_EDGE_EPS = 0.03; // < ~2 min of taper reads as a hard edge
// Travel wings render in their own hue (§8). This is the user's existing
// "travelling to another location" vibe — spec-aligned and in her colour language.
export const TRAVEL_HEX = '#fc844f';
export const DEFAULT_TRAVEL_HOURS = 0.5; // a gentle default wing you can drag
export const MAX_TRAVEL_HOURS = 4;

export const laneFor = (b: Block) => LANES.find((l) => l.id === b.laneId)!;
export const taperLen = (b: Block) => b.taperEndHours - b.coreEndHours;
export const isHardEdge = (b: Block) => taperLen(b) < HARD_EDGE_EPS;
export const isAppointment = (b: Block) => b.kind === 'appointment';

export function blockFill(b: Block): string {
  // vibeId may be a member id OR a category id (cat:*) — resolveVibe handles both.
  const v = resolveVibe(b.vibeId);
  return v ? v.hex : NEUTRAL;
}

// Solid, confident core.
export function corePath(b: Block): string {
  const lane = laneFor(b);
  return annularSector(
    C,
    C,
    lane.rInner,
    lane.rOuter,
    hoursToAngle(b.startHours),
    hoursToAngle(b.coreEndHours),
  );
}

// The fade: stepped-opacity arc segments (§2/§4 — SVG handles the taper
// natively this way). Opacity eases toward nothing, like a coloured pencil
// lifting off the page.
export function taperSegments(b: Block): { d: string; opacity: number }[] {
  const span = taperLen(b);
  if (span < HARD_EDGE_EPS) return [];
  const a0 = hoursToAngle(b.coreEndHours);
  const aSpan = (span / 24) * 360;
  const lane = laneFor(b);
  const n = Math.max(6, Math.round(span * 14)); // a step roughly every ~4 min
  const overlap = (aSpan / n) * 0.14; // hairline-killing seam overlap
  const segs: { d: string; opacity: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = a0 + (aSpan * i) / n;
    const e = a0 + (aSpan * (i + 1)) / n + overlap;
    const t = (i + 0.5) / n; // midpoint keeps it continuous with the core
    const opacity = 0.9 * Math.pow(1 - t, 1.4);
    segs.push({ d: annularSector(C, C, lane.rInner, lane.rOuter, s, e), opacity });
  }
  return segs;
}

// The luminous taper handle sits at the tail, on the lane's mid-line.
export function handlePos(b: Block): { x: number; y: number } {
  const lane = laneFor(b);
  const rMid = (lane.rInner + lane.rOuter) / 2;
  return polar(C, C, rMid, hoursToAngle(b.taperEndHours));
}

// Is a point (radius + hours-of-day) inside this block's full angular span?
export function blockContains(b: Block, r: number, hours: number): boolean {
  const lane = laneFor(b);
  if (r < lane.rInner || r > lane.rOuter) return false;
  const s = b.startHours;
  const e = b.taperEndHours;
  return (hours >= s && hours <= e) || (hours + 24 >= s && hours + 24 <= e);
}

// ----- appointment travel-time wings (§8) -----
// "A solid appointment bar with two wings that fade AWAY from it. The fade still
//  means 'my guess'; for travel the guess lives on the outside."
//   • Prepend: hard edge butting the appointment start (you must ARRIVE by then),
//     fading backward toward "whenever I leave" (departure is the estimate).
//   • Append: hard edge at the appointment's end, fading outward toward
//     "whenever I get home."
// Both are stepped-opacity arcs in the travel hue.

interface Seg {
  d: string;
  opacity: number;
}

function wingSegments(
  b: Block,
  fromHours: number,
  toHours: number,
  // opacityAt(t): t runs 0→1 across the wing in DRAW order (from→to).
  opacityAt: (t: number) => number,
): Seg[] {
  const span = Math.abs(toHours - fromHours);
  if (span < HARD_EDGE_EPS) return [];
  const lane = laneFor(b);
  const a0 = hoursToAngle(fromHours);
  const aSpan = ((toHours - fromHours) / 24) * 360; // signed
  const n = Math.max(6, Math.round(span * 14));
  const overlapMag = (Math.abs(aSpan) / n) * 0.14;
  const sign = aSpan >= 0 ? 1 : -1;
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const s = a0 + (aSpan * i) / n;
    const e = a0 + (aSpan * (i + 1)) / n + sign * overlapMag;
    const t = (i + 0.5) / n;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    segs.push({ d: annularSector(C, C, lane.rInner, lane.rOuter, lo, hi), opacity: opacityAt(t) });
  }
  return segs;
}

// Prepend wing: drawn from the leave-time outward to the appointment start, so
// opacity RISES toward the appointment (solid where you must arrive).
export function prependWingSegments(b: Block): Seg[] {
  const len = b.travelBeforeHours ?? 0;
  if (len < HARD_EDGE_EPS) return [];
  return wingSegments(b, b.startHours - len, b.startHours, (t) => 0.15 + 0.7 * Math.pow(t, 1.3));
}

// Append wing: drawn from the appointment end outward, opacity FALLS toward
// "whenever I get home."
export function appendWingSegments(b: Block): Seg[] {
  const len = b.travelAfterHours ?? 0;
  if (len < HARD_EDGE_EPS) return [];
  return wingSegments(b, b.coreEndHours, b.coreEndHours + len, (t) => 0.85 * Math.pow(1 - t, 1.3));
}

// Where the "leave now" departure edge sits (start of the prepend wing) — the
// load-bearing notification anchor (§7/§8): the ping fires here, not at the
// appointment time.
export function departureHours(b: Block): number {
  return b.startHours - (b.travelBeforeHours ?? 0);
}
