// 🐟 2D Fish Studio — Code Generation & Export Engine

import type { FishConfig } from './fishConfig';

export interface GeneratedFishCode {
  ontologySnippet: string;
  engine3dJson: string;
  combined: string;
}

export function generateFishCode(cfg: FishConfig): GeneratedFishCode {
  // 1. species_ontology.js entry
  const primaryEmitter = cfg.emitters.find((e) => e.enabled) || cfg.emitters[0];
  const ontologyObj = {
    id: cfg.id || 'custom_fish',
    label: cfg.label || 'Custom Koi',
    family: cfg.family || 'common_pond',
    moteType: cfg.moteType || 'ambient_mote',
    eligible_ponds: cfg.eligible_ponds.length ? cfg.eligible_ponds : ['home_pond'],
    eligible_seasons: cfg.eligible_seasons.length ? cfg.eligible_seasons : ['all'],
    eligible_weathers: cfg.eligible_weathers.length ? cfg.eligible_weathers : ['clear'],
    spawn_weight: cfg.spawn_weight || 1.0,
    rarities: {
      [cfg.rarity || 'common']: {
        id: cfg.rarity || 'common',
        label: `[${cfg.family.replace(/_/g, ' ')}] ${cfg.label}`,
        bodyColor: cfg.body.baseColor,
        finColor: cfg.fins.finColor,
        markingColor: cfg.dorsal.markingColor,
        emissionEnergy: Number(cfg.emission.energy.toFixed(2)),
        treatment: cfg.treatment || 'Graceful swimmer in calm waters.',
      },
    },
  };

  const ontologySnippet = `// Paste into species_ontology.js (Species Definitions)
export const ${cfg.id.toUpperCase()} = ${JSON.stringify(ontologyObj, null, 2)};`;

  // 2. 3D Material / Shader Uniforms JSON (for Godot, Unity, Three.js)
  const engine3dObj = {
    id: cfg.id,
    albedoColor: cfg.body.baseColor,
    gradientEndColor: cfg.body.baseGradientEnd,
    underbellyColor: cfg.body.underbellyColor,
    markingTexture: cfg.dorsal.pattern,
    markingColor: cfg.dorsal.markingColor,
    markingSecondaryColor: cfg.dorsal.markingSecondaryColor,
    markingScale: cfg.dorsal.scaleSize,
    markingDensity: cfg.dorsal.density,
    markingBlur: cfg.dorsal.blur || 0,
    finColor: cfg.fins.finColor,
    finAccentColor: cfg.fins.finAccentColor,
    finSweep: cfg.fins.sweep,
    tailMode: cfg.tail.mode,
    tailLength: cfg.tail.length,
    emissionColor: cfg.emission.color,
    emissionEnergy: Number(cfg.emission.energy.toFixed(2)),
    pulseWave: cfg.emission.pulseWave,
    pulseSpeed: cfg.emission.pulseSpeed,
    finFlutterSpeed: cfg.fins.flutterFreq,
    tailWiggleAmp: Number((cfg.tail.tipWhipAmp / 100).toFixed(3)),
    vfxEmitters: cfg.emitters
      .filter((e) => e.enabled)
      .map((e) => ({
        socket: e.socket,
        particle: e.shape,
        count: e.count,
        speed: e.speed,
        lifeSpan: [e.lifeMin, e.lifeMax],
        colorStart: e.colorStart,
        colorMid: e.colorMid,
        colorEnd: e.colorEnd,
        glowMode: e.glowMode || 'follow',
        glowBlur: e.glowBlur ?? 10,
        glowColor: e.glowColor || e.colorStart,
      })),
  };

  const engine3dJson = `// 3D Shader Uniforms / Material JSON
${JSON.stringify(engine3dObj, null, 2)}`;

  const combined = `${ontologySnippet}

${engine3dJson}
`;

  return {
    ontologySnippet,
    engine3dJson,
    combined,
  };
}
