// 🐟 2D Fish Studio — The Fish Coach (Live Design Auditing)

import type { FishConfig } from './fishConfig';

export interface FishCoachNote {
  id: string;
  title: string;
  kind: 'ok' | 'nudge' | 'tip';
  note: string;
}

// Convert hex color to relative luminance (WCAG formula)
function getLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 0.5;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function fishCoach(cfg: FishConfig): FishCoachNote[] {
  const notes: FishCoachNote[] = [];

  // 1. Marking Contrast & Readability
  if (cfg.dorsal.pattern !== 'plain') {
    const contrast = getContrastRatio(cfg.body.baseColor, cfg.dorsal.markingColor);
    if (contrast < 1.45 && cfg.dorsal.blendMode === 'source-over') {
      notes.push({
        id: 'marking_contrast',
        title: 'Marking Contrast',
        kind: 'nudge',
        note: `Dorsal markings (${cfg.dorsal.markingColor}) have low contrast (${contrast.toFixed(1)}:1) against the base body core (${cfg.body.baseColor}). Brighten or darken markings to ensure crisp visual readability.`,
      });
    } else {
      notes.push({
        id: 'marking_contrast',
        title: 'Marking Contrast',
        kind: 'ok',
        note: 'Dorsal markings separate clearly from the body core, reading cleanly in clear water.',
      });
    }
  }

  // 2. Luminescence Restraint & Grounding Shadows
  const baseLum = getLuminance(cfg.body.baseColor);
  if (cfg.emission.energy > 2.0 && baseLum > 0.65) {
    notes.push({
      id: 'luminescence_balance',
      title: 'Luminescence Restraint',
      kind: 'nudge',
      note: `High emission energy (${cfg.emission.energy.toFixed(1)}) over a light base color (${cfg.body.baseColor}) risks blowing out the silhouette into a white bloom. Deepen the core body tone for a dramatic celestial glow.`,
    });
  } else if (cfg.emission.energy > 0) {
    notes.push({
      id: 'luminescence_balance',
      title: 'Luminescence Balance',
      kind: 'ok',
      note: 'Bioluminescent bloom is well balanced against the body base tone without washing out silhouettes.',
    });
  }

  // 3. Fin Flutter & Tail Wave Kinematic Harmony
  const flutterFreq = cfg.fins.flutterFreq;
  const tailSpeed = cfg.tail.swaySpeed;
  const ratio = flutterFreq / tailSpeed;
  const isHarmonic = Math.abs(ratio - 1.0) < 0.25 || Math.abs(ratio - 1.5) < 0.25 || Math.abs(ratio - 2.0) < 0.25;

  if (!isHarmonic && Math.abs(flutterFreq - tailSpeed) > 1.8) {
    notes.push({
      id: 'kinematics_sync',
      title: 'Kinematic Cadence',
      kind: 'tip',
      note: `Pectoral fin flutter (${flutterFreq.toFixed(1)} Hz) and tail sway (${tailSpeed.toFixed(1)} Hz) are out of sync. Harmonic ratios (like 1.5× or 2× tail speed) create natural fluid swimming strokes.`,
    });
  } else {
    notes.push({
      id: 'kinematics_sync',
      title: 'Kinematic Cadence',
      kind: 'ok',
      note: 'Fin flutter and caudal tail wave propagation move in natural aquatic rhythm.',
    });
  }

  // 4. Fin Depth & Translucency
  if (cfg.fins.transparency > 0.9) {
    notes.push({
      id: 'fin_depth',
      title: 'Fin Translucency',
      kind: 'tip',
      note: 'Pectoral fins are almost fully opaque. Lowering opacity to 0.65–0.75 gives the appearance of delicate aquatic webbing.',
    });
  } else if (cfg.fins.transparency < 0.3) {
    notes.push({
      id: 'fin_depth',
      title: 'Fin Opacity',
      kind: 'nudge',
      note: 'Fin transparency is very low (< 0.3), making fins almost invisible against pond water.',
    });
  } else {
    notes.push({
      id: 'fin_depth',
      title: 'Aquatic Depth',
      kind: 'ok',
      note: 'Fin translucency and subsurface shadows give the fish genuine depth and immersion.',
    });
  }

  // 5. Particle Budget
  const totalActiveParticles = cfg.emitters
    .filter((e) => e.enabled)
    .reduce((sum, e) => sum + e.count, 0);

  if (totalActiveParticles > 45) {
    notes.push({
      id: 'particle_budget',
      title: 'Particle Budget',
      kind: 'nudge',
      note: `Active particle count (${totalActiveParticles}) is high. For optimal 60 FPS mobile pond rendering, keep concurrent particles under 35.`,
    });
  } else {
    notes.push({
      id: 'particle_budget',
      title: 'Particle Budget',
      kind: 'ok',
      note: `Active particle density (${totalActiveParticles} particles) is well within performance targets.`,
    });
  }

  return notes;
}
