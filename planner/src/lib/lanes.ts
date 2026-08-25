// Lanes: radius = task type (spec §3). Concentric rings, position-from-centre
// selects the lane. Seven concentric rings — outermost is 'main' (load-bearing),
// innermost is 'symptom' (MCAS tracker). The health-tracking cluster sits inside:
// emotion, then medication + appetite, then symptom (Ash, 2026-08-23).
//
// Radii are in viewBox units (the canvas is 400×400, centre at 200,200). Ordered
// outer→inner; each ~3u gap keeps the bands legible now that seven share the disc.

export interface Lane {
  id: string;
  label: string;
  rInner: number;
  rOuter: number;
}

export const LANES: Lane[] = [
  { id: 'main',       label: 'Main',       rInner: 160, rOuter: 182 }, // outer = load-bearing
  { id: 'washer',     label: 'Washer',     rInner: 137, rOuter: 157 },
  { id: 'dryer',      label: 'Dryer',      rInner: 114, rOuter: 134 },
  { id: 'emotion',    label: 'Emotion',    rInner: 95,  rOuter: 111 },
  { id: 'medication', label: 'Medication', rInner: 80,  rOuter: 92  },
  { id: 'appetite',   label: 'Appetite',   rInner: 65,  rOuter: 77  },
  { id: 'symptom',    label: 'Symptom',    rInner: 52,  rOuter: 62  },
];

export const RIM_RADIUS = 182; // outer edge of the main lane
export const LABEL_RADIUS = 194; // hour numbers sit just outside the rim
export const HUB_RADIUS = 50; // centre circle: date + env state

// Snap an arbitrary radius to the nearest lane by its mid-line (spec §5: input
// snaps to the nearest lane radially).
export function laneAtRadius(r: number): Lane {
  let best = LANES[0];
  let bestDist = Infinity;
  for (const lane of LANES) {
    const mid = (lane.rInner + lane.rOuter) / 2;
    const d = Math.abs(r - mid);
    if (d < bestDist) {
      bestDist = d;
      best = lane;
    }
  }
  return best;
}
