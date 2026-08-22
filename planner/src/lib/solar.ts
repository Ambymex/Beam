// Real solar-position math (SunCalc-style, dependency-free) so the sky tracks
// the sun's ACTUAL altitude at the user's location — not fixed clock hours.
// Hour-band phases drift badly by season and latitude (a Brisbane winter
// sunset is ~5pm, a summer one ~6:45pm; near the poles they collapse entirely).
//
// Ported from Vladimir Agafonkin's SunCalc (BSD-2). Self-contained and pure so
// BOTH the lite companion and the Radial Planner can import the same file.

const rad = Math.PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the ecliptic

const toJulian = (date: Date) => date.valueOf() / dayMs - 0.5 + J1970;
const toDays = (date: Date) => toJulian(date) - J2000;

function rightAscension(l: number, b: number) {
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
}
function declination(l: number, b: number) {
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}
function siderealTime(d: number, lw: number) {
  return rad * (280.16 + 360.9856235 * d) - lw;
}
function solarMeanAnomaly(d: number) {
  return rad * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}
function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

// Sun altitude above the horizon, in DEGREES (negative = below the horizon).
export function sunAltitudeDeg(date: Date, lat: number, lon: number): number {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  return alt / rad;
}

export type SolarPhase = 'pre_dawn' | 'sunrise' | 'day' | 'sunset' | 'twilight' | 'night';

// Derive a phase from the sun's true altitude and whether it is rising or
// setting. Thresholds: +6° well up (day); the −0.833°…+6° band is the horizon
// glow (sunrise rising / sunset setting); −12°…−0.833° is twilight (pre_dawn
// rising / dusk setting); below −12° is night. −0.833° includes atmospheric
// refraction (the standard sunrise/sunset horizon); −12° is nautical twilight.
export function solarPhaseFromAltitude(alt: number, rising: boolean): SolarPhase {
  if (alt >= 6) return 'day';
  if (alt >= -0.833) return rising ? 'sunrise' : 'sunset';
  if (alt >= -12) return rising ? 'pre_dawn' : 'twilight';
  return 'night';
}

// Convenience: the solar phase at a location and moment. `rising` is decided by
// sampling the altitude 10 minutes later — robust across the day without a
// separate solar-noon calculation.
export function getSolarPhase(date: Date, lat: number, lon: number): SolarPhase {
  const alt = sunAltitudeDeg(date, lat, lon);
  const altLater = sunAltitudeDeg(new Date(date.getTime() + 600000), lat, lon);
  return solarPhaseFromAltitude(alt, altLater > alt);
}

// Fallback when no location is configured: the old fixed-hour bands, so the app
// still themes reasonably before a city is set.
export function solarPhaseByHour(date: Date): SolarPhase {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 7) return 'pre_dawn';
  if (h >= 7 && h < 9) return 'sunrise';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'sunset';
  if (h >= 19 && h < 20) return 'twilight';
  return 'night';
}
