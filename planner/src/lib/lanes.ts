// Lanes: radius = task type (spec §3). Concentric rings, position-from-centre
// selects the lane. Three fixed lanes; optional user-defined inner lanes get
// added later. The two appliance lanes are first-class, not optional extras —
// they externalise the wash/dry sequencing that's hard to hold in the head.
//
// Radii are in viewBox units (the canvas is 400×400, centre at 200,200).

export interface Lane {
  id: string;
  label: string;
  rInner: number;
  rOuter: number;
}

export const LANES: Lane[] = [
  { id: 'main', label: 'Main', rInner: 142, rOuter: 182 }, // outer = load-bearing
  { id: 'washer', label: 'Washer', rInner: 110, rOuter: 138 },
  { id: 'dryer', label: 'Dryer', rInner: 78, rOuter: 106 },
];

export const RIM_RADIUS = 182; // outer edge of the main lane
export const LABEL_RADIUS = 194; // hour numbers sit just outside the rim
export const HUB_RADIUS = 66; // centre circle: date + (later) spatial cycle

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
