// Lanes: radius = task type (spec §3). Concentric rings, position-from-centre
// selects the lane. Five concentric rings — outermost is 'main' (load-bearing),
// innermost is 'symptom' (MCAS tracker).
//
// Radii are in viewBox units (the canvas is 400×400, centre at 200,200).

export interface Lane {
  id: string;
  label: string;
  rInner: number;
  rOuter: number;
}

export const LANES: Lane[] = [
  { id: 'main',    label: 'Main',    rInner: 148, rOuter: 182 }, // outer = load-bearing
  { id: 'washer',  label: 'Washer',  rInner: 120, rOuter: 144 },
  { id: 'dryer',   label: 'Dryer',   rInner: 92,  rOuter: 116 },
  { id: 'emotion', label: 'Emotion', rInner: 68,  rOuter: 88  },
  { id: 'symptom', label: 'Symptom', rInner: 54,  rOuter: 64  },
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
