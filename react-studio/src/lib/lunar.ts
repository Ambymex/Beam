export const SYNODIC_MONTH = 29.530588853;

export type LunarHemisphere = 'north' | 'south';
export type LunarSide = 'left' | 'right';

export interface LunarPhaseInfo {
  day: number;
  angle: number;
  illumination: number;
  waxing: boolean;
  side: LunarSide;
  name: string;
}

export function normalizeLunarDay(day: number): number {
  return ((day % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

export function lunarPhaseInfo(day: number, hemisphere: LunarHemisphere): LunarPhaseInfo {
  const normalized = normalizeLunarDay(day);
  const angle = (normalized / SYNODIC_MONTH) * Math.PI * 2;
  const illumination = (1 - Math.cos(angle)) / 2;
  const waxing = normalized <= SYNODIC_MONTH / 2;
  const northSide: LunarSide = waxing ? 'right' : 'left';
  const side: LunarSide = hemisphere === 'north'
    ? northSide
    : northSide === 'right' ? 'left' : 'right';

  const eighth = SYNODIC_MONTH / 8;
  const names = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent',
  ];
  const index = Math.round(normalized / eighth) % 8;
  return { day: normalized, angle, illumination, waxing, side, name: names[index] };
}

// Projected-sphere phase geometry. The bright limb is one semicircle of the
// lunar disc; the terminator is the projected ellipse x = cos(phase) * sqrt.
// This produces the correct illuminated area (rather than sliding a dark
// circle across the face, which creates impossible intermediate phases).
export function lunarLitPath(
  day: number,
  hemisphere: LunarHemisphere,
  cx = 50,
  cy = 50,
  radius = 46,
): string {
  const info = lunarPhaseInfo(day, hemisphere);
  if (info.illumination < 0.000001) return '';
  if (info.illumination > 0.999999) {
    return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`;
  }

  const phase = info.angle <= Math.PI ? info.angle : Math.PI * 2 - info.angle;
  const terminator = Math.cos(phase);
  const sideSign = info.side === 'right' ? 1 : -1;
  const outerSweep = info.side === 'right' ? 1 : 0;
  const terminatorOnRight = sideSign * terminator >= 0;
  const terminatorSweep = terminatorOnRight ? 0 : 1;
  const terminatorRadius = Math.max(0.001, Math.abs(radius * terminator));

  return [
    `M ${cx} ${cy - radius}`,
    `A ${radius} ${radius} 0 0 ${outerSweep} ${cx} ${cy + radius}`,
    `A ${terminatorRadius.toFixed(4)} ${radius} 0 0 ${terminatorSweep} ${cx} ${cy - radius}`,
    'Z',
  ].join(' ');
}
