// Geometry for the radial 24-hour day-ring.
//
// Spatial-over-numeric (spec §0.1, §2): time-of-day is an ANGLE, lane is a
// RADIUS. Midnight sits at the BOTTOM (6 o'clock), noon at the TOP (12 o'clock),
// and time runs CLOCKWISE — so the day rises up the left side and sets down the
// right (circadian, intentional).
//
// All angles here are DEGREES measured clockwise from the top (12 o'clock) in
// SVG screen space, where the y-axis points down.

export interface Point {
  x: number;
  y: number;
}

// Hours-from-midnight (0..24, may run past for cross-midnight blocks) -> angle.
// Deliberately NOT wrapped to [0,360): keeping it monotonic lets the now-wedge
// and cross-midnight arcs sweep without a seam. polar() handles values >360.
//   t=0  (midnight) -> 180  (bottom)
//   t=12 (noon)     -> 540 ≡ 0 (top)
export function hoursToAngle(hours: number): number {
  return 180 + (hours / 24) * 360;
}

// Inverse: a screen angle -> hours-from-midnight, wrapped to [0,24).
export function angleToHours(angleDeg: number): number {
  let h = ((angleDeg - 180) / 360) * 24;
  h = ((h % 24) + 24) % 24;
  return h;
}

// Polar -> Cartesian (angle clockwise from top).
export function polar(cx: number, cy: number, r: number, angleDeg: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

// Screen point -> angle (deg, clockwise from top, in [0,360)).
export function pointToAngle(cx: number, cy: number, x: number, y: number): number {
  let a = (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

// Distance of a screen point from the centre.
export function pointRadius(cx: number, cy: number, x: number, y: number): number {
  return Math.hypot(x - cx, y - cy);
}

// Annular-sector ("thick arc") path between two radii, sweeping CLOCKWISE from
// startAngle to endAngle. endAngle may exceed startAngle by up to 360.
export function annularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

// Pie sector from the centre out to radius r (the now-wedge, §14).
export function pieSector(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r, startAngle);
  const p2 = polar(cx, cy, r, endAngle);
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}
