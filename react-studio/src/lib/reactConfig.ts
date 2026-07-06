import type { ShapeKind } from './shapes';

// The parametric model of a particle-shower react — the family that covers
// black_hearts, sparks, liquid drift, cherry_blossoms, etc. One-off set pieces
// (the tungsten strike) are intentionally out of scope: they aren't parametric.

export type Direction = 'fall' | 'rise' | 'burst';
export type ColorMode = 'fixed' | 'signal' | 'contrast';

export interface ReactConfig {
  id: string;
  label: string;
  register: string; // one-line emotional register, for the companion prompt

  direction: Direction;
  count: number;
  spawnWindow: number; // seconds to trickle the spawn over
  durMin: number;
  durMax: number; // travel time range, seconds

  shape: ShapeKind;
  customPath: string;
  sizeMin: number;
  sizeMax: number; // px

  colorMode: ColorMode; // fixed hex list, or theme --signal / --signal-contrast
  colors: string[]; // used when colorMode === 'fixed' (1+ for variation)

  opacityMin: number;
  opacityMax: number;

  spin: boolean;
  rotMax: number; // deg/sec magnitude (rotation rate)

  swayAmp: number; // px flutter amplitude (0 = none)
  swayMin: number;
  swayMax: number; // flutter period range, seconds

  driftX: number; // net horizontal drift, vw (fall/rise); burst radiates
  glowBlur: number; // px halo (0 = none)
  glowColor: string; // hex, or 'auto' to derive from the particle fill
}

// A concrete spawned particle (randomised within the config ranges). Shared by
// the live preview and the fire-replay; generate.ts emits the equivalent.
export interface Particle {
  id: number;
  x: number; // spawn column %, for fall/rise
  size: number;
  color: string;
  delay: number;
  dur: number;
  op: number;
  rotEnd: number; // total deg over travel
  swayAmp: number;
  swayDur: number;
  swayPhase: number;
  driftX: number; // vw
  angle: number; // deg, for burst
  distance: number; // vmin, for burst
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function fillColor(cfg: ReactConfig): string {
  if (cfg.colorMode === 'signal') return 'var(--signal)';
  if (cfg.colorMode === 'contrast') return 'var(--signal-contrast)';
  const c = cfg.colors;
  return c.length ? c[Math.floor(Math.random() * c.length)] : '#ffffff';
}

let seq = 0;
export function spawnParticles(cfg: ReactConfig): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const dur = rand(cfg.durMin, cfg.durMax);
    const swayDur = rand(cfg.swayMin, cfg.swayMax);
    out.push({
      id: seq++,
      x: rand(4, 96),
      size: Math.round(rand(cfg.sizeMin, cfg.sizeMax)),
      color: fillColor(cfg),
      delay: rand(0, cfg.spawnWindow),
      dur,
      op: rand(cfg.opacityMin, cfg.opacityMax),
      rotEnd: cfg.spin ? (Math.random() < 0.5 ? -1 : 1) * cfg.rotMax * dur : 0,
      swayAmp: cfg.swayAmp ? rand(cfg.swayAmp * 0.6, cfg.swayAmp) : 0,
      swayDur,
      swayPhase: rand(0, swayDur),
      driftX: rand(-cfg.driftX, cfg.driftX),
      angle: rand(0, 360),
      distance: rand(20, 42),
    });
  }
  return out;
}

export const DEFAULT_CONFIG: ReactConfig = {
  id: 'my_react',
  label: 'My React',
  register: 'A gentle gesture — describe when the companion should use it.',
  direction: 'fall',
  count: 30,
  spawnWindow: 1.5,
  durMin: 2.6,
  durMax: 3.8,
  shape: 'heart',
  customPath: '',
  sizeMin: 8,
  sizeMax: 24,
  colorMode: 'fixed',
  colors: ['#0a0a0a'],
  opacityMin: 0.7,
  opacityMax: 1,
  spin: true,
  rotMax: 30,
  swayAmp: 20,
  swayMin: 1.4,
  swayMax: 2.8,
  driftX: 0,
  glowBlur: 0,
  glowColor: 'auto',
};

// Starting points that mirror shipped reacts, so there's something alive on
// first load and a template to riff on.
export const PRESETS: Record<string, ReactConfig> = {
  black_hearts: { ...DEFAULT_CONFIG, id: 'black_hearts', label: 'Black Hearts', register: 'Affection landing as physical presence — soft weight, real mass.' },
  cherry_blossoms: {
    ...DEFAULT_CONFIG,
    id: 'cherry_blossoms',
    label: 'Cherry Blossoms',
    register: 'Playful, sweet, gently admiring — deliberate cuteness, blushing affection.',
    direction: 'burst',
    count: 26,
    spawnWindow: 2.5,
    durMin: 3,
    durMax: 4,
    shape: 'petal',
    sizeMin: 8,
    sizeMax: 11,
    colorMode: 'fixed',
    colors: ['#ffd5e5', '#fce4ee'],
    opacityMin: 0.75,
    opacityMax: 0.95,
    rotMax: 60,
    swayAmp: 26,
    swayMin: 0.9,
    swayMax: 1.6,
    glowBlur: 8,
    glowColor: '#ffcde4',
  },
  sparks: {
    ...DEFAULT_CONFIG,
    id: 'sparks',
    label: 'Sparks',
    register: 'Pride or excitement lifting off — wins, milestones, genuine delight.',
    direction: 'rise',
    count: 28,
    spawnWindow: 1.2,
    durMin: 2.4,
    durMax: 3.4,
    shape: 'star',
    sizeMin: 5,
    sizeMax: 14,
    colorMode: 'fixed',
    colors: ['#ffd98a'],
    opacityMin: 0.55,
    opacityMax: 1,
    rotMax: 40,
    swayAmp: 10,
    swayMin: 1.1,
    swayMax: 2.2,
    glowBlur: 3,
    glowColor: '#ffd98a',
  },
};
