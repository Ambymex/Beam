import type { AtmosphericEffectConfig } from './atmosphere';

const n = (value: number) => Number(value.toFixed(3)).toString();
const q = (value: string) => JSON.stringify(value);

function optics(effect: AtmosphericEffectConfig): string {
  if (effect.phenomenon === 'corona') {
    return `{
      ringCount: ${effect.ringCount}, innerRadius: ${n(effect.innerRadius)}, ringSpacing: ${n(effect.ringSpacing)},
      chromaticSpread: ${n(effect.chromaticSpread)}, softness: ${n(effect.softness)}, opacity: ${n(effect.opacity)},
      radialAsymmetry: ${n(effect.radialAsymmetry)}, pulseDepth: ${n(effect.pulseDepth)},
      pulseDuration: ${n(effect.pulseDuration)}, scintillation: ${n(effect.scintillation)}
    }`;
  }
  if (effect.phenomenon === 'glory') {
    return `{
      haloDiameter: ${n(effect.haloDiameter)}, ringCount: ${effect.ringCount},
      ringCompression: ${n(effect.ringCompression)}, mistDensity: ${n(effect.mistDensity)},
      silhouetteOpacity: ${n(effect.silhouetteOpacity)}, edgeDiffusion: ${n(effect.edgeDiffusion)},
      radialIrregularity: ${n(effect.radialIrregularity)}, revealDuration: ${n(effect.revealDuration)},
      mistFadeDuration: ${n(effect.mistFadeDuration)}
    }`;
  }
  if (effect.phenomenon === 'moonDogs') {
    return `{
      lateralOffset: ${n(effect.lateralOffset)}, pairSymmetry: ${n(effect.pairSymmetry)},
      colorFringe: ${n(effect.colorFringe)}, brightness: ${n(effect.brightness)},
      onsetDelay: ${n(effect.onsetDelay)}, hoverDrift: ${n(effect.hoverDrift)},
      fadeOrder: ${q(effect.fadeOrder)}
    }`;
  }
  return `{
      beadCount: ${effect.beadCount}, beadRadius: ${n(effect.beadRadius)},
      beadIrregularity: ${n(effect.beadIrregularity)}, beadSize: ${n(effect.beadSize)},
      beadBrightness: ${n(effect.beadBrightness)}, beadSequence: ${q(effect.beadSequence)},
      ignitionSpread: ${n(effect.ignitionSpread)}, finalFlash: ${n(effect.finalFlash)}
    }`;
}

export function generateAtmosphereExport(
  reactId: string,
  effects: AtmosphericEffectConfig[],
): string {
  if (!effects.length) return '';
  const exportName = `${reactId.replace(/[^a-zA-Z0-9_]/g, '_')}Atmosphere`;
  const rows = effects.map((effect) => `  {
    id: ${q(effect.id)},
    name: ${q(effect.name)},
    enabled: ${effect.enabled},
    source: ${q(effect.source)},
    phenomenon: ${q(effect.phenomenon)},
    narrative: ${q(effect.narrative)},
    anchor: { x: ${n(effect.x)}, y: ${n(effect.y)} },
    timing: { delay: ${n(effect.delay)}, duration: ${n(effect.duration)} },
    intensity: ${n(effect.intensity)},
    palette: {
      mode: ${q(effect.colorMode)},
      colours: [${q(effect.color)}, ${q(effect.secondaryColor)}, ${q(effect.tertiaryColor)}]
    },
    optics: ${optics(effect)}
  }`).join(',\n');

  return `// Portable atmospheric layer data. Feed this to the shared
// AtmosphericVfx renderer; source positions are percentages of its viewport.
export interface AtmosphericVfxPreset {
  id: string;
  name: string;
  enabled: boolean;
  source: 'focusMoon' | 'baily' | 'target' | 'atmosphere' | 'sharedMidpoint';
  phenomenon: 'corona' | 'glory' | 'moonDogs' | 'bailyBeads';
  narrative: 'gather' | 'recognise' | 'consider' | 'commit' | 'offer' | 'refuse' | 'release' | 'settle' | 'remain';
  anchor: { x: number; y: number };
  timing: { delay: number; duration: number };
  intensity: number;
  palette: {
    mode: 'fixed' | 'signal' | 'contrast';
    colours: [string, string, string];
  };
  optics: Record<string, string | number | boolean>;
}

export const ${exportName}: AtmosphericVfxPreset[] = [
${rows}
];`;
}
