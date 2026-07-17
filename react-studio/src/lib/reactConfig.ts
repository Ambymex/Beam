import type { ShapeKind, CustomPathPart } from './shapes';

// The parametric model of a particle-gesture react — the family that covers
// black_hearts, sparks, liquid drift, cherry_blossoms, convergence, etc. One-off set pieces
// (the tungsten strike) are intentionally out of scope: they aren't parametric.
//
// v2: a react is now 1–4 LAYERS, each its own emitter. Dense support + sparse
// hero is how complex reacts are actually built; per-layer delay gives
// choreography phases. Old single-emitter drafts migrate via migrateConfig().

export type Direction = 'fall' | 'rise' | 'burst' | 'fountain' | 'converge';
export type ColorMode = 'fixed' | 'signal' | 'contrast';
export type ColorStopMode = ColorMode | 'hold';
export type GlowColorMode = 'auto' | 'fixed';
export type GlowColorStopMode = GlowColorMode | 'hold';
export type EaseKind = 'linear' | 'easeIn' | 'easeOut' | 'softInOut' | 'overshoot';

// Named travel easings, each with the habit it teaches. `pts` are the
// cubic-bezier control points (null = straight line) for the curve thumbnail.
export const EASES: Record<
  EaseKind,
  { css: string; label: string; teach: string; pts: [number, number, number, number] | null }
> = {
  linear: {
    css: 'linear',
    label: 'Linear',
    teach: 'Constant speed. Right for rain, snow, confetti seen in bulk — the eye reads the flock, not the particle. Mechanical for a single hero shape.',
    pts: null,
  },
  easeIn: {
    css: 'cubic-bezier(0.5, 0, 0.85, 0.3)',
    label: 'Accelerate (gravity)',
    teach: 'Starts slow, ends fast — how gravity feels. Heavy things gain speed as they fall.',
    pts: [0.5, 0, 0.85, 0.3],
  },
  easeOut: {
    // the shipped burst bezier, kept verbatim so old presets look identical
    css: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
    label: 'Decelerate (spent energy)',
    teach: 'Fast start, gentle arrival — bursts and thrown things spend their energy early, then coast.',
    pts: [0.2, 0.7, 0.3, 1],
  },
  softInOut: {
    css: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
    label: 'Soft in-out (drift)',
    teach: 'Breathes in and out — weightless drift. Lovely for slow floaty layers; wrong for anything with mass.',
    pts: [0.45, 0.05, 0.55, 0.95],
  },
  overshoot: {
    css: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    label: 'Overshoot (playful)',
    teach: 'Pops past the mark and settles back — cartoon energy. Delightful in one sparse layer; chaos in more.',
    pts: [0.34, 1.56, 0.64, 1],
  },
};

export interface LayerConfig {
  name: string; // shown on the layer chip
  muted: boolean; // preview-only solo/study aid; export includes muted layers

  direction: Direction;
  count: number;
  spawnWindow: number; // seconds to trickle the spawn over
  layerDelay: number; // seconds before this layer's first particle (phrasing)
  durMin: number;
  durMax: number; // travel time range, seconds
  travelEase: EaseKind;

  shape: ShapeKind;
  customPath: string;
  customViewBox: string;
  customPaths: CustomPathPart[];
  customShapeName: string;
  sizeMin: number;
  sizeMax: number; // px
  // Coherent randomness: sample one depth per particle and derive size (big =
  // near), speed (near = fast) and opacity from it, so variation reads as
  // depth instead of noise.
  depthLink: boolean;

  colorMode: ColorMode; // fixed hex list, or theme --signal / --signal-contrast
  colors: string[]; // used when colorMode === 'fixed' (1+ for variation)
  colorMidMode: ColorStopMode; // 'hold' inherits the previous colour stop
  colorsMid: string[];
  colorEndMode: ColorStopMode;
  colorsEnd: string[];

  opacityMin: number;
  opacityMax: number;
  // Fade envelope, % of travel: 0 → fadeInPct rise, hold, fadeOutPct → 100 fall.
  fadeInPct: number;
  fadeOutPct: number;
  // Scale over travel (grow-in / shrink-out).
  scaleFrom: number;
  scaleMid: number;
  scaleTo: number;
  sizeEnvelope: boolean; // false preserves the original single from→to scale
  envelopeMidPct: number; // shared size/colour/glow middle stop, % of travel

  spin: boolean;
  rotMax: number; // deg/sec magnitude (rotation rate)

  swayAmp: number; // px flutter amplitude (0 = none)
  swayMin: number;
  swayMax: number; // flutter period range, seconds

  driftX: number; // net horizontal spread, vw (fall/rise/fountain); burst radiates
  arcApex: number; // fountain: how high the arc rises, vh
  focusRadius: number; // converge: landing-cloud radius around centre, vmin

  // glow: 'none', a 'fixed' coloured halo, or an 'adaptive' theme-readability
  // rim (light rim on dark themes, soft dark rim on light) — the trick that
  // keeps a dark particle visible on dark skies, like the shipped black hearts.
  glowMode: 'none' | 'fixed' | 'adaptive';
  glowBlur: number; // px halo strength at the start (fixed + adaptive)
  glowBlurMid: number;
  glowBlurEnd: number;
  glowEnvelope: boolean;
  // `glowColor` is retained as a compatibility mirror for old drafts.
  glowColor: string;
  glowColorMode: GlowColorMode;
  glowColors: string[];
  glowColorMidMode: GlowColorStopMode;
  glowColorsMid: string[];
  glowColorEndMode: GlowColorStopMode;
  glowColorsEnd: string[];
}

export interface ReactConfig {
  id: string;
  label: string;
  register: string; // one-line emotional register, for the companion prompt
  layers: LayerConfig[];
}

export const MAX_LAYERS = 4;

// A concrete spawned particle (randomised within the layer ranges). Shared by
// the live preview and the fire-replay; generate.ts emits the equivalent.
export interface Particle {
  id: number;
  x: number; // spawn column %, for fall/rise/fountain
  size: number;
  color: string;
  colorMid: string;
  colorEnd: string;
  glowColor: string;
  glowColorMid: string;
  glowColorEnd: string;
  delay: number; // includes the layer delay
  dur: number;
  op: number;
  inDur: number; // fade envelope, seconds
  outDelay: number;
  outDur: number;
  envMidDur: number; // shared size/colour first phase
  envEndDelay: number;
  envEndDur: number;
  rotEnd: number; // total deg over travel
  swayAmp: number;
  swayDur: number;
  swayPhase: number;
  driftX: number; // vw
  angle: number; // deg, for burst
  distance: number; // vmin, burst travel or converge focus radius
  apex: number; // vh, for fountain
  fromX: number; // vmin, converge scatter offset from centre
  fromY: number; // vmin, converge scatter offset from centre
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function pickColor(mode: ColorMode, colors: string[]): string {
  if (mode === 'signal') return 'var(--signal)';
  if (mode === 'contrast') return 'var(--signal-contrast)';
  const c = colors;
  return c.length ? c[Math.floor(Math.random() * c.length)] : '#ffffff';
}

export function fillColors(layer: LayerConfig): [string, string, string] {
  const start = pickColor(layer.colorMode, layer.colors);
  const middle = layer.colorMidMode === 'hold'
    ? start
    : pickColor(layer.colorMidMode, layer.colorsMid);
  const end = layer.colorEndMode === 'hold'
    ? middle
    : pickColor(layer.colorEndMode, layer.colorsEnd);
  return [start, middle, end];
}

function pickGlowColor(mode: GlowColorMode, colors: string[], fill: string): string {
  if (mode === 'auto') return fill;
  return colors.length ? colors[Math.floor(Math.random() * colors.length)] : '#ffffff';
}

export function fillGlowColors(
  layer: LayerConfig,
  fills: [string, string, string],
): [string, string, string] {
  const start = pickGlowColor(layer.glowColorMode, layer.glowColors, fills[0]);
  const middle = layer.glowColorMidMode === 'hold'
    ? start
    : pickGlowColor(layer.glowColorMidMode, layer.glowColorsMid, fills[1]);
  const end = layer.glowColorEndMode === 'hold'
    ? middle
    : pickGlowColor(layer.glowColorEndMode, layer.glowColorsEnd, fills[2]);
  return [start, middle, end];
}

let seq = 0;
export function spawnLayer(layer: LayerConfig): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < layer.count; i++) {
    let size: number, dur: number, op: number;
    if (layer.depthLink) {
      // one depth sample drives everything: near = big, fast, solid
      const t = Math.random();
      size = Math.round(lerp(layer.sizeMin, layer.sizeMax, t));
      dur = lerp(layer.durMax, layer.durMin, t);
      op = lerp(layer.opacityMin, layer.opacityMax, 0.3 + t * 0.7);
    } else {
      size = Math.round(rand(layer.sizeMin, layer.sizeMax));
      dur = rand(layer.durMin, layer.durMax);
      op = rand(layer.opacityMin, layer.opacityMax);
    }
    const swayDur = rand(layer.swayMin, layer.swayMax);
    const delay = layer.layerDelay + rand(0, layer.spawnWindow);
    const angle = rand(0, 360);
    const distance = layer.direction === 'converge'
      ? Math.sqrt(Math.random()) * layer.focusRadius
      : rand(20, 42);
    const fromAngle = rand(0, 360);
    const fromDistance = rand(28, 68);
    const fills = fillColors(layer);
    const [color, colorMid, colorEnd] = fills;
    const [glowColor, glowColorMid, glowColorEnd] = fillGlowColors(layer, fills);
    out.push({
      id: seq++,
      x: rand(4, 96),
      size,
      color,
      colorMid,
      colorEnd,
      glowColor,
      glowColorMid,
      glowColorEnd,
      delay,
      dur,
      op,
      inDur: (dur * layer.fadeInPct) / 100,
      outDelay: delay + (dur * layer.fadeOutPct) / 100,
      outDur: (dur * (100 - layer.fadeOutPct)) / 100,
      envMidDur: (dur * layer.envelopeMidPct) / 100,
      envEndDelay: delay + (dur * layer.envelopeMidPct) / 100,
      envEndDur: (dur * (100 - layer.envelopeMidPct)) / 100,
      rotEnd: layer.spin ? (Math.random() < 0.5 ? -1 : 1) * layer.rotMax * dur : 0,
      swayAmp: layer.swayAmp ? rand(layer.swayAmp * 0.6, layer.swayAmp) : 0,
      swayDur,
      swayPhase: rand(0, swayDur),
      driftX: rand(-layer.driftX, layer.driftX),
      angle,
      distance,
      apex: rand(layer.arcApex * 0.7, layer.arcApex),
      fromX: Math.cos((fromAngle * Math.PI) / 180) * fromDistance,
      fromY: Math.sin((fromAngle * Math.PI) / 180) * fromDistance * 0.7,
    });
  }
  return out;
}

export function spawnAll(cfg: ReactConfig): Particle[][] {
  return cfg.layers.map((l) => (l.muted ? [] : spawnLayer(l)));
}

// Longest any layer lives, for DOM cleanup + loop cadence. Muted layers still
// count (so un-muting mid-loop doesn't strand particles).
export function lifeMs(cfg: ReactConfig): number {
  let max = 0;
  for (const l of cfg.layers) {
    max = Math.max(max, l.layerDelay + l.spawnWindow + l.durMax);
  }
  return max * 1000 + 400;
}

export const DEFAULT_LAYER: LayerConfig = {
  name: 'Layer 1',
  muted: false,
  direction: 'fall',
  count: 30,
  spawnWindow: 1.5,
  layerDelay: 0,
  durMin: 2.6,
  durMax: 3.8,
  travelEase: 'linear',
  shape: 'heart',
  customPath: '',
  customViewBox: '0 0 24 24',
  customPaths: [],
  customShapeName: '',
  sizeMin: 8,
  sizeMax: 24,
  depthLink: false,
  colorMode: 'fixed',
  colors: ['#0a0a0a'],
  colorMidMode: 'hold',
  colorsMid: ['#ffffff'],
  colorEndMode: 'hold',
  colorsEnd: ['#ffffff'],
  opacityMin: 0.7,
  opacityMax: 1,
  fadeInPct: 8,
  fadeOutPct: 72,
  scaleFrom: 1,
  scaleMid: 1,
  scaleTo: 1,
  sizeEnvelope: false,
  envelopeMidPct: 50,
  spin: true,
  rotMax: 30,
  swayAmp: 20,
  swayMin: 1.4,
  swayMax: 2.8,
  driftX: 0,
  arcApex: 55,
  focusRadius: 10,
  glowMode: 'none',
  glowBlur: 6,
  glowBlurMid: 6,
  glowBlurEnd: 6,
  glowEnvelope: false,
  glowColor: 'auto',
  glowColorMode: 'auto',
  glowColors: ['#ffffff'],
  glowColorMidMode: 'hold',
  glowColorsMid: ['#ffffff'],
  glowColorEndMode: 'hold',
  glowColorsEnd: ['#ffffff'],
};

export const DEFAULT_CONFIG: ReactConfig = {
  id: 'my_react',
  label: 'My React',
  register: 'A gentle gesture — describe when the companion should use it.',
  layers: [{
    ...DEFAULT_LAYER,
    colors: [...DEFAULT_LAYER.colors],
    colorsMid: [...DEFAULT_LAYER.colorsMid],
    colorsEnd: [...DEFAULT_LAYER.colorsEnd],
    glowColors: [...DEFAULT_LAYER.glowColors],
    glowColorsMid: [...DEFAULT_LAYER.glowColorsMid],
    glowColorsEnd: [...DEFAULT_LAYER.glowColorsEnd],
    customPaths: DEFAULT_LAYER.customPaths.map((part) => ({ ...part })),
  }],
};

export function newLayer(n: number): LayerConfig {
  return {
    ...DEFAULT_LAYER,
    name: `Layer ${n}`,
    colors: [...DEFAULT_LAYER.colors],
    colorsMid: [...DEFAULT_LAYER.colorsMid],
    colorsEnd: [...DEFAULT_LAYER.colorsEnd],
    glowColors: [...DEFAULT_LAYER.glowColors],
    glowColorsMid: [...DEFAULT_LAYER.glowColorsMid],
    glowColorsEnd: [...DEFAULT_LAYER.glowColorsEnd],
    customPaths: DEFAULT_LAYER.customPaths.map((part) => ({ ...part })),
  };
}

// Accepts a v1 flat config (no `layers`), a v2 config, or a partly-old v2
// (missing newer per-layer fields) and returns a complete v2 config. Used on
// draft load and preset load so nothing saved ever goes stale.
export function migrateConfig(raw: any): ReactConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG, layers: [newLayer(1)] };
  if (Array.isArray(raw.layers)) {
    const layers = raw.layers.length
      ? raw.layers.map((l: any, i: number) => migrateLayer(l, i + 1))
      : [newLayer(1)];
    return { id: raw.id ?? 'my_react', label: raw.label ?? 'My React', register: raw.register ?? '', layers };
  }
  // v1: emitter fields lived flat on the config
  const { id, label, register, ...emitter } = raw;
  // v1 bursts had a hardcoded decelerate bezier + 0.3 grow-in
  const wasBurst = emitter.direction === 'burst';
  const layer: LayerConfig = {
    ...migrateLayer(emitter, 1),
    name: 'Layer 1',
    travelEase: wasBurst ? 'easeOut' : 'linear',
    scaleFrom: wasBurst ? 0.3 : 1,
  };
  return { id: id ?? 'my_react', label: label ?? 'My React', register: register ?? '', layers: [layer] };
}

function migrateLayer(l: any, n: number): LayerConfig {
  const legacyGlowColor = typeof l.glowColor === 'string' ? l.glowColor : DEFAULT_LAYER.glowColor;
  const glowColorMode: GlowColorMode = l.glowColorMode
    ?? (legacyGlowColor === 'auto' ? 'auto' : 'fixed');
  const glowColors = l.glowColors
    ?? (legacyGlowColor !== 'auto' ? [legacyGlowColor] : DEFAULT_LAYER.glowColors);
  return {
    ...newLayer(n),
    ...l,
    glowColorMode,
    glowColor: glowColorMode === 'auto' ? 'auto' : (glowColors[0] ?? '#ffffff'),
    colors: [...(l.colors ?? DEFAULT_LAYER.colors)],
    colorsMid: [...(l.colorsMid ?? DEFAULT_LAYER.colorsMid)],
    colorsEnd: [...(l.colorsEnd ?? DEFAULT_LAYER.colorsEnd)],
    glowColors: [...glowColors],
    glowColorsMid: [...(l.glowColorsMid ?? DEFAULT_LAYER.glowColorsMid)],
    glowColorsEnd: [...(l.glowColorsEnd ?? DEFAULT_LAYER.glowColorsEnd)],
    customPaths: (l.customPaths ?? DEFAULT_LAYER.customPaths).map((part: CustomPathPart) => ({ ...part })),
  };
}

// Starting points that mirror shipped reacts, so there's something alive on
// first load and a template to riff on.
const preset = (
  id: string,
  label: string,
  register: string,
  layer: Partial<LayerConfig>,
): ReactConfig => ({
  id,
  label,
  register,
  layers: [{ ...DEFAULT_LAYER, name: 'Layer 1', ...layer }],
});

export const PRESETS: Record<string, ReactConfig> = {
  black_hearts: preset(
    'black_hearts',
    'Black Hearts',
    'Affection landing as physical presence — soft weight, real mass.',
    // the adaptive rim is what keeps these visible on dark skies
    { glowMode: 'adaptive', glowBlur: 6 },
  ),
  cherry_blossoms: preset(
    'cherry_blossoms',
    'Cherry Blossoms',
    'Playful, sweet, gently admiring — deliberate cuteness, blushing affection.',
    {
      direction: 'burst',
      travelEase: 'easeOut',
      scaleFrom: 0.3,
      count: 26,
      spawnWindow: 2.5,
      durMin: 3,
      durMax: 4,
      shape: 'petal',
      sizeMin: 8,
      sizeMax: 11,
      colors: ['#ffd5e5', '#fce4ee'],
      opacityMin: 0.75,
      opacityMax: 0.95,
      rotMax: 60,
      swayAmp: 26,
      swayMin: 0.9,
      swayMax: 1.6,
      glowMode: 'fixed',
      glowBlur: 8,
      glowColor: '#ffcde4',
      glowColorMode: 'fixed',
      glowColors: ['#ffcde4'],
    },
  ),
  liquid_hearts: preset(
    'liquid_hearts',
    'Liquid Hearts',
    'Affection with heat behind it — desire, closeness, intimacy. The most private react; never casual.',
    {
      count: 13,
      spawnWindow: 2.5,
      durMin: 5.5,
      durMax: 7.5, // honey-slow, ~40% of confetti speed
      sizeMin: 12,
      sizeMax: 34,
      colors: ['#f8f0e0', '#f5f0e6', '#f5f2ea'], // warm-to-cool creams
      opacityMin: 0.85,
      opacityMax: 1,
      rotMax: 12, // lazy rotation
      swayAmp: 8,
      swayMin: 1.6,
      swayMax: 2.6,
      driftX: 4,
      glowMode: 'adaptive',
      glowBlur: 5,
    },
  ),
  // the layering-by-example preset: a sparse fountain hero over a dense,
  // dim, slower support layer — study how the two share the work
  champagne_toast: {
    id: 'champagne_toast',
    label: 'Champagne Toast',
    register: 'A toast — celebration with weight behind it: real wins, big mornings, moments worth raising a glass to.',
    layers: [
      {
        ...DEFAULT_LAYER,
        name: 'Spray (hero)',
        direction: 'fountain',
        count: 14,
        spawnWindow: 0.9,
        durMin: 2.8,
        durMax: 3.6,
        shape: 'sparkle',
        sizeMin: 8,
        sizeMax: 16,
        depthLink: true,
        colors: ['#ffd98a', '#ffe9b8'],
        opacityMin: 0.7,
        opacityMax: 1,
        fadeInPct: 6,
        fadeOutPct: 70,
        rotMax: 60,
        swayAmp: 6,
        swayMin: 1,
        swayMax: 1.8,
        driftX: 14,
        arcApex: 55,
        glowMode: 'fixed',
        glowBlur: 4,
        glowColor: 'auto',
      },
      {
        ...DEFAULT_LAYER,
        name: 'Mist (support)',
        direction: 'rise',
        count: 26,
        spawnWindow: 2.2,
        layerDelay: 0.3,
        durMin: 3.5,
        durMax: 5.5,
        shape: 'circle',
        sizeMin: 3,
        sizeMax: 6,
        depthLink: true,
        colors: ['#ffd98a'],
        opacityMin: 0.25,
        opacityMax: 0.5,
        fadeInPct: 12,
        fadeOutPct: 65,
        spin: false,
        rotMax: 0,
        swayAmp: 8,
        swayMin: 1.4,
        swayMax: 2.4,
        driftX: 3,
      },
    ],
  },
  // Codex's first Studio studies: three different kinds of momentum, kept as
  // templates rather than shipped reacts so they stay safe places to riff.
  threads_converge: {
    id: 'threads_converge',
    label: 'Threads Converge',
    register: 'Recognition arriving quietly — scattered details resolving into one pattern worth following.',
    layers: [
      {
        ...DEFAULT_LAYER,
        name: 'Loose threads (support)',
        direction: 'rise',
        count: 24,
        spawnWindow: 2.4,
        durMin: 4.2,
        durMax: 6.4,
        travelEase: 'softInOut',
        shape: 'circle',
        sizeMin: 3,
        sizeMax: 7,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.18,
        opacityMax: 0.46,
        fadeInPct: 14,
        fadeOutPct: 68,
        spin: false,
        rotMax: 0,
        swayAmp: 9,
        swayMin: 1.8,
        swayMax: 3.2,
        driftX: 5,
      },
      {
        ...DEFAULT_LAYER,
        name: 'The click (hero)',
        direction: 'burst',
        count: 7,
        spawnWindow: 0.55,
        layerDelay: 0.85,
        durMin: 2.4,
        durMax: 3.3,
        travelEase: 'easeOut',
        shape: 'sparkle',
        sizeMin: 9,
        sizeMax: 18,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.68,
        opacityMax: 1,
        fadeInPct: 6,
        fadeOutPct: 72,
        scaleFrom: 0.25,
        scaleTo: 1.05,
        rotMax: 24,
        swayAmp: 3,
        swayMin: 1.3,
        swayMax: 2.1,
        glowMode: 'adaptive',
        glowBlur: 5,
      },
    ],
  },
  second_pass: {
    id: 'second_pass',
    label: 'Second Pass',
    register: 'A gentle reset after something misses — no shame, no drama, just room for another try.',
    layers: [
      {
        ...DEFAULT_LAYER,
        name: 'Breathing room (support)',
        direction: 'fall',
        count: 18,
        spawnWindow: 3,
        durMin: 5,
        durMax: 7.2,
        travelEase: 'linear',
        shape: 'circle',
        sizeMin: 2,
        sizeMax: 6,
        depthLink: true,
        colors: ['#e8edf5', '#f7f3eb'],
        opacityMin: 0.16,
        opacityMax: 0.38,
        fadeInPct: 16,
        fadeOutPct: 64,
        spin: false,
        rotMax: 0,
        swayAmp: 7,
        swayMin: 2.2,
        swayMax: 3.8,
        driftX: 4,
      },
      {
        ...DEFAULT_LAYER,
        name: 'Fresh margin (hero)',
        direction: 'fall',
        count: 7,
        spawnWindow: 2.2,
        layerDelay: 0.45,
        durMin: 5.4,
        durMax: 7.8,
        travelEase: 'softInOut',
        shape: 'moon',
        sizeMin: 15,
        sizeMax: 28,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.5,
        opacityMax: 0.86,
        fadeInPct: 12,
        fadeOutPct: 66,
        scaleFrom: 0.88,
        scaleTo: 1,
        rotMax: 8,
        swayAmp: 15,
        swayMin: 2.4,
        swayMax: 4.2,
        driftX: 7,
        glowMode: 'adaptive',
        glowBlur: 4,
      },
    ],
  },
  clean_compile: {
    id: 'clean_compile',
    label: 'Clean Compile',
    register: 'The quiet satisfaction when a stubborn thing finally works — earned relief and a small private grin.',
    layers: [
      {
        ...DEFAULT_LAYER,
        name: 'Resolved noise (support)',
        direction: 'rise',
        count: 20,
        spawnWindow: 1.8,
        durMin: 3.6,
        durMax: 5.4,
        travelEase: 'easeOut',
        shape: 'circle',
        sizeMin: 3,
        sizeMax: 7,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.2,
        opacityMax: 0.48,
        fadeInPct: 10,
        fadeOutPct: 68,
        spin: false,
        rotMax: 0,
        swayAmp: 6,
        swayMin: 1.5,
        swayMax: 2.7,
        driftX: 4,
      },
      {
        ...DEFAULT_LAYER,
        name: 'Green light (hero)',
        direction: 'fountain',
        count: 9,
        spawnWindow: 0.7,
        layerDelay: 0.35,
        durMin: 2.8,
        durMax: 3.8,
        travelEase: 'easeOut',
        shape: 'sparkle',
        sizeMin: 8,
        sizeMax: 16,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.64,
        opacityMax: 1,
        fadeInPct: 5,
        fadeOutPct: 70,
        scaleFrom: 0.45,
        scaleTo: 1,
        rotMax: 42,
        swayAmp: 4,
        swayMin: 1.1,
        swayMax: 1.9,
        driftX: 10,
        arcApex: 42,
        glowMode: 'adaptive',
        glowBlur: 5,
      },
    ],
  },
  structure_found: {
    id: 'structure_found',
    label: 'Structure Found',
    register: 'The moment confusion stops being noise — a pattern locks into place, holds, then makes room for the next thought.',
    layers: [
      {
        ...DEFAULT_LAYER,
        name: 'Loose syntax (support)',
        direction: 'converge',
        count: 26,
        spawnWindow: 0.7,
        durMin: 3.2,
        durMax: 4.1,
        travelEase: 'easeOut',
        shape: 'circle',
        sizeMin: 3,
        sizeMax: 7,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.18,
        opacityMax: 0.42,
        fadeInPct: 6,
        fadeOutPct: 82,
        scaleFrom: 0.45,
        scaleTo: 0.82,
        spin: false,
        rotMax: 0,
        swayAmp: 0,
        focusRadius: 14,
      },
      {
        ...DEFAULT_LAYER,
        name: 'Open angle (hero)',
        direction: 'converge',
        count: 3,
        spawnWindow: 0.4,
        layerDelay: 0.55,
        durMin: 2.8,
        durMax: 3.4,
        travelEase: 'easeOut',
        shape: 'caret',
        sizeMin: 19,
        sizeMax: 30,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.72,
        opacityMax: 1,
        fadeInPct: 5,
        fadeOutPct: 90,
        scaleFrom: 0.55,
        scaleTo: 1,
        spin: false,
        rotMax: 0,
        swayAmp: 0,
        focusRadius: 2.5,
        glowMode: 'adaptive',
        glowBlur: 6,
      },
      {
        ...DEFAULT_LAYER,
        name: 'Released thought (afterglow)',
        direction: 'rise',
        count: 10,
        spawnWindow: 0.8,
        layerDelay: 3.3,
        durMin: 2.4,
        durMax: 3.4,
        travelEase: 'easeOut',
        shape: 'sparkle',
        sizeMin: 4,
        sizeMax: 9,
        depthLink: true,
        colorMode: 'signal',
        opacityMin: 0.28,
        opacityMax: 0.62,
        fadeInPct: 7,
        fadeOutPct: 70,
        scaleFrom: 0.65,
        scaleTo: 0.9,
        rotMax: 24,
        swayAmp: 5,
        swayMin: 1.2,
        swayMax: 2.1,
        driftX: 4,
        glowMode: 'adaptive',
        glowBlur: 3,
      },
    ],
  },
  signal_bloom: preset(
    'signal_bloom',
    'Signal Bloom',
    'Recognition becoming confidence — a thought brightening, opening, and settling into itself.',
    {
      direction: 'burst',
      count: 14,
      spawnWindow: 1.1,
      durMin: 2.8,
      durMax: 3.8,
      travelEase: 'easeOut',
      shape: 'sparkle',
      sizeMin: 9,
      sizeMax: 20,
      depthLink: true,
      colorMode: 'signal',
      colorMidMode: 'contrast',
      colorEndMode: 'signal',
      opacityMin: 0.62,
      opacityMax: 1,
      fadeInPct: 5,
      fadeOutPct: 78,
      sizeEnvelope: true,
      scaleFrom: 0.3,
      scaleMid: 1.45,
      scaleTo: 0.72,
      envelopeMidPct: 46,
      rotMax: 32,
      swayAmp: 4,
      swayMin: 1.2,
      swayMax: 2.1,
      glowMode: 'adaptive',
      glowBlur: 5,
    },
  ),
  sparks: preset(
    'sparks',
    'Sparks',
    'Pride or excitement lifting off — wins, milestones, genuine delight.',
    {
      direction: 'rise',
      count: 28,
      spawnWindow: 1.2,
      durMin: 2.4,
      durMax: 3.4,
      shape: 'star',
      sizeMin: 5,
      sizeMax: 14,
      colors: ['#ffd98a'],
      opacityMin: 0.55,
      opacityMax: 1,
      rotMax: 40,
      swayAmp: 10,
      swayMin: 1.1,
      swayMax: 2.2,
      glowMode: 'fixed',
      glowBlur: 3,
      glowColor: '#ffd98a',
      glowColorMode: 'fixed',
      glowColors: ['#ffd98a'],
    },
  ),
};
