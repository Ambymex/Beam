// On-the-fly edit + cascade math (spec §9). Pure and svelte-free so it's
// unit-testable; RadialCanvas calls these from the live drag, recomputing from
// a grab-time snapshot each move so there's no accumulation drift.
//
// Grammar tie-in (§4): a cascade pushes SOFT (tapered, "mine to estimate")
// blocks forward and STOPS at the next HARD-edged block (the world's deadline),
// flagging it rather than silently trampling it.

import type { Block } from './blocks';
import { isHardEdge } from './blocks';

const MIN_LEN = 0.25; // a block's core can't shrink below ~15 min

export interface EditResult {
  blocks: Block[];
  blockedId: number | null; // the hard-edged block that halted a cascade
}

function shift(b: Block, slip: number): void {
  b.startHours += slip;
  b.coreEndHours += slip;
  b.taperEndHours += slip;
}

// Move a block by `slip` hours (whole block rides). With cascade, also shift
// downstream SAME-LANE blocks by the same slip, halting at the first hard-edged
// one (which is returned as blockedId).
export function computeMove(
  snapshot: Block[],
  id: number,
  slip: number,
  cascade: boolean,
): EditResult {
  const blocks = snapshot.map((b) => ({ ...b }));
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks, blockedId: null };

  const lane = target.laneId;
  const origStart = target.startHours;
  shift(target, slip);

  if (!cascade) return { blocks, blockedId: null };

  const downstream = blocks
    .filter((b) => b.id !== id && b.laneId === lane && b.startHours >= origStart)
    .sort((a, b) => a.startHours - b.startHours);

  let blockedId: number | null = null;
  for (const b of downstream) {
    if (isHardEdge(b)) {
      blockedId = b.id; // the world's deadline — stop here, flag it
      break;
    }
    shift(b, slip);
  }
  return { blocks, blockedId };
}

// Resize the leading edge (start). Core end + taper stay put; start can't cross
// coreEnd (keeps at least MIN_LEN of core).
export function computeResizeStart(snapshot: Block[], id: number, slip: number): EditResult {
  const blocks = snapshot.map((b) => ({ ...b }));
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks, blockedId: null };
  target.startHours = Math.min(target.startHours + slip, target.coreEndHours - MIN_LEN);
  return { blocks, blockedId: null };
}

// Resize the core's trailing edge (coreEnd). The taper rides along by the same
// delta, so the fade length is preserved. Core can't shrink below MIN_LEN.
export function computeResizeCore(snapshot: Block[], id: number, slip: number): EditResult {
  const blocks = snapshot.map((b) => ({ ...b }));
  const target = blocks.find((b) => b.id === id);
  if (!target) return { blocks, blockedId: null };
  const newCoreEnd = Math.max(target.startHours + MIN_LEN, target.coreEndHours + slip);
  const delta = newCoreEnd - target.coreEndHours;
  target.coreEndHours = newCoreEnd;
  target.taperEndHours += delta;
  return { blocks, blockedId: null };
}

// Shortest signed angular distance between two hours-of-day, in (-12, 12].
export function angDiffHours(a: number, b: number): number {
  let d = (a - b) % 24;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}
