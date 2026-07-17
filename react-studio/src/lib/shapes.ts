// Particle silhouettes. Two kinds: an SVG path (heart, star, custom…) or a
// CSS border-radius shape (circle, blossom petal) — mirroring how the real
// reacts draw them. generate.ts emits markup matching each kind.

export type ShapeKind =
  | 'heart'
  | 'star'
  | 'sparkle'
  | 'circle'
  | 'petal'
  | 'droplet'
  | 'leaf'
  | 'moon'
  | 'snowflake'
  | 'bolt'
  | 'caret'
  | 'custom';

export interface ShapeDef {
  render: 'path' | 'css';
  viewBox?: string;
  d?: string; // path data (render === 'path')
  paths?: CustomPathPart[]; // imported SVGs may contain several transformed paths
  radius?: string; // border-radius (render === 'css')
}

export interface CustomPathPart {
  d: string;
  transform?: string;
  fillRule?: 'nonzero' | 'evenodd';
}

// house heart + 4-point champagne star, verbatim from CompanionReacts.svelte
const HEART_D =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const STAR_D = 'M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z';
// 4-point glint with concave sides — the "anime sparkle"
const SPARKLE_D =
  'M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z';
// teardrop: pointed crown, round belly
const DROPLET_D =
  'M12 1.5 C12 1.5 5 10.5 5 15.3 C5 19.5 8.1 22.5 12 22.5 C15.9 22.5 19 19.5 19 15.3 C19 10.5 12 1.5 12 1.5 Z';
// curled quarter-leaf silhouette
const LEAF_D = 'M20 4 C10 4 4 10 4 20 C14 20 20 14 20 4 Z';
// waxing crescent: big outer arc, inner arc bites the light side out
const MOON_D = 'M21 12.8 A9.5 9.5 0 1 1 11.2 3 A7.6 7.6 0 0 0 21 12.8 Z';
// six thin arms = three crossing diamonds (0°/60°/120° about centre)
const SNOWFLAKE_D =
  'M12 23 L10.7 12 L12 1 L13.3 12 Z M21.5 17.5 L11.4 13.1 L2.5 6.5 L12.7 10.9 Z M2.5 17.5 L11.4 10.9 L21.5 6.5 L12.7 13.1 Z';
const BOLT_D = 'M13 2 L4 14 L10 14 L9 22 L20 9 L13 9 Z';
// open angle / code caret: a softened chevron with enough body to glow cleanly
const CARET_D = 'M5 3 L8.2 1 L21 12 L8.2 23 L5 21 L15.5 12 Z';

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  heart: { render: 'path', viewBox: '0 0 24 24', d: HEART_D },
  star: { render: 'path', viewBox: '0 0 24 24', d: STAR_D },
  sparkle: { render: 'path', viewBox: '0 0 24 24', d: SPARKLE_D },
  circle: { render: 'css', radius: '50%' },
  // pinched-corner blossom, same as the Sweet theme's ambient petals
  petal: { render: 'css', radius: '150% 0 150% 0' },
  droplet: { render: 'path', viewBox: '0 0 24 24', d: DROPLET_D },
  leaf: { render: 'path', viewBox: '0 0 24 24', d: LEAF_D },
  moon: { render: 'path', viewBox: '0 0 24 24', d: MOON_D },
  snowflake: { render: 'path', viewBox: '0 0 24 24', d: SNOWFLAKE_D },
  bolt: { render: 'path', viewBox: '0 0 24 24', d: BOLT_D },
  caret: { render: 'path', viewBox: '0 0 24 24', d: CARET_D },
  custom: { render: 'path', viewBox: '0 0 24 24', d: HEART_D },
};

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  heart: 'Heart',
  star: 'Star',
  sparkle: 'Sparkle (glint)',
  circle: 'Circle',
  petal: 'Blossom petal',
  droplet: 'Droplet',
  leaf: 'Leaf',
  moon: 'Crescent moon',
  snowflake: 'Snowflake',
  bolt: 'Bolt',
  caret: 'Open angle / caret',
  custom: 'Custom path',
};
