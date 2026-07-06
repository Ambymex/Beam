// Particle silhouettes. Two kinds: an SVG path (heart, star, custom) or a
// CSS border-radius shape (circle, blossom petal) — mirroring how the real
// reacts draw them. generate.ts emits markup matching each kind.

export type ShapeKind = 'heart' | 'star' | 'circle' | 'petal' | 'custom';

export interface ShapeDef {
  render: 'path' | 'css';
  viewBox?: string;
  d?: string; // path data (render === 'path')
  radius?: string; // border-radius (render === 'css')
}

// house heart + 4-point champagne star, verbatim from CompanionReacts.svelte
const HEART_D =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const STAR_D = 'M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z';

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  heart: { render: 'path', viewBox: '0 0 24 24', d: HEART_D },
  star: { render: 'path', viewBox: '0 0 24 24', d: STAR_D },
  circle: { render: 'css', radius: '50%' },
  // pinched-corner blossom, same as the Sweet theme's ambient petals
  petal: { render: 'css', radius: '150% 0 150% 0' },
  custom: { render: 'path', viewBox: '0 0 24 24', d: HEART_D },
};

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  heart: 'Heart',
  star: 'Star',
  circle: 'Circle',
  petal: 'Blossom petal',
  custom: 'Custom path',
};
