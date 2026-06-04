// Lanes: radius = task type (spec §3). Concentric rings, position-from-centre
// selects the lane. Four concentric rings, innermost is 'emotion' to track feelings,
// followed by dryer, washer, and main (outermost).
//
// Radii are in viewBox units (the canvas is 400×400, centre at 200,200).

export interface Lane {
  id: string;
  label: string;
  rInner: number;
  rOuter: number;
}

export const LANES: Lane[] = [
  { id: 'main', label: 'Main', rInner: 144, rOuter: 182 }, // outer = load-bearing
  { id: 'washer', label: 'Washer', rInner: 114, rOuter: 140 },
  { id: 'dryer', label: 'Dryer', rInner: 84, rOuter: 110 },
  { id: 'emotion', label: 'Emotion', rInner: 54, rOuter: 80 },
];

export const RIM_RADIUS = 182; // outer edge of the main lane
export const LABEL_RADIUS = 194; // hour numbers sit just outside the rim
export const HUB_RADIUS = 50; // centre circle: date + spatial cycle

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
