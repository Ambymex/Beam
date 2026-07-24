export type AtmosphericPhenomenon =
  | 'corona'
  | 'glory'
  | 'moonDogs'
  | 'bailyBeads'
  | 'lightPillar'
  | 'heiligenschein'
  | 'virga'
  | 'brockenSpectre';
export type AtmosphericSource =
  | 'focusMoon'
  | 'baily'
  | 'pawHand'
  | 'target'
  | 'atmosphere'
  | 'sharedMidpoint';
export type NarrativeEnvelope =
  | 'gather'
  | 'recognise'
  | 'consider'
  | 'commit'
  | 'offer'
  | 'refuse'
  | 'release'
  | 'settle'
  | 'remain';
export type AtmosphericColorMode = 'fixed' | 'signal' | 'contrast';
export type FadeOrder = 'together' | 'leftFirst' | 'rightFirst';
export type BeadSequence = 'sequential' | 'irregular';
export type VirgaFadeCurve = 'soft' | 'balanced' | 'late';

export interface AtmosphericEffectConfig {
  id: string;
  name: string;
  enabled: boolean;
  phenomenon: AtmosphericPhenomenon;
  source: AtmosphericSource;
  narrative: NarrativeEnvelope;
  x: number;
  y: number;
  delay: number;
  duration: number;
  intensity: number;
  previewSource: boolean;
  colorMode: AtmosphericColorMode;
  color: string;
  secondaryColor: string;
  tertiaryColor: string;

  // Corona — diffraction gathering around a focus.
  ringCount: number;
  innerRadius: number;
  ringSpacing: number;
  chromaticSpread: number;
  softness: number;
  opacity: number;
  radialAsymmetry: number;
  pulseDepth: number;
  pulseDuration: number;
  scintillation: number;

  // Glory — presence condensing through mist.
  haloDiameter: number;
  ringCompression: number;
  mistDensity: number;
  silhouetteOpacity: number;
  edgeDiffusion: number;
  radialIrregularity: number;
  revealDuration: number;
  mistFadeDuration: number;

  // Sun/moon dogs — paired attention around the focus.
  lateralOffset: number;
  pairSymmetry: number;
  colorFringe: number;
  brightness: number;
  onsetDelay: number;
  hoverDrift: number;
  fadeOrder: FadeOrder;

  // Baily's beads — brief, uneven threshold lights.
  beadCount: number;
  beadRadius: number;
  beadIrregularity: number;
  beadSize: number;
  beadBrightness: number;
  beadSequence: BeadSequence;
  ignitionSpread: number;
  finalFlash: number;

  // Light pillar - committed action aligned from source to target.
  targetX: number;
  targetY: number;
  pillarWidth: number;
  pillarTaper: number;
  verticalSoftness: number;
  coreBrightness: number;
  suspendedDensity: number;
  riseTime: number;
  holdTime: number;
  decayTime: number;
  residualShimmer: number;

  // Heiligenschein - local retroreflection around a contact patch.
  contactRadius: number;
  dewDensity: number;
  retroBrightness: number;
  localFalloff: number;
  shimmerFrequency: number;
  viewerAlignment: number;
  dewPersistence: number;

  // Virga - descending strands that evaporate before contact.
  trailLength: number;
  descentSpeed: number;
  evaporationHeight: number;
  strandCount: number;
  virgaFadeCurve: VirgaFadeCurve;
  lateralWind: number;
  dropletBrightness: number;
  terminalOpacity: number;

  // Brocken spectre - a rare, fog-projected enlargement of presence.
  projectionScale: number;
  perspectiveStretch: number;
  projectionBlur: number;
  projectionOpacity: number;
  fogDepth: number;
  motionLag: number;
  haloIntensity: number;
  projectionOffsetX: number;
  projectionOffsetY: number;
  distortionNoise: number;
}

export const PHENOMENON_LABELS: Record<AtmosphericPhenomenon, string> = {
  corona: 'Corona · focus and attention',
  glory: 'Glory · recognition of presence',
  moonDogs: 'Moon-dogs · shared attention',
  bailyBeads: 'Baily’s beads · threshold and identity',
  lightPillar: 'Light pillar · committed action',
  heiligenschein: 'Heiligenschein · intimate regard',
  virga: 'Virga · restraint and release',
  brockenSpectre: 'Brocken spectre · expanded agency',
};

export const PHENOMENON_NOTES: Record<AtmosphericPhenomenon, string> = {
  corona: 'Mostly intensification, not travel: soft diffraction rings sharpen as attention gathers.',
  glory: 'A presence briefly condenses out of mist, stabilises, then dissolves back into air.',
  moonDogs: 'Two centres held in relation: one side-light appears, the second follows, then both settle.',
  bailyBeads: 'Rare jewel-like points ignite unevenly along the focus rim. Keep this sacred, not decorative.',
  lightPillar: 'A narrow source-to-target shaft condenses, holds a decision, then releases as suspended residue - never a laser.',
  heiligenschein: 'Dew-light gathers close to a contact patch. It rewards quiet attention rather than announcing itself.',
  virga: 'Downward strands form, thin and evaporate before contact: refusal without failure, damage or punishment.',
  brockenSpectre: 'A softened projection extends Baily’s agency into fog. It is atmospheric presence, not a second creature.',
};

export const SOURCE_LABELS: Record<AtmosphericSource, string> = {
  focusMoon: 'Focus moon',
  baily: 'Baily',
  pawHand: 'Paw-hand',
  target: 'Target object',
  atmosphere: 'Atmosphere',
  sharedMidpoint: 'Player/Baily midpoint',
};

export const NARRATIVE_LABELS: Record<NarrativeEnvelope, string> = {
  gather: 'Gather',
  recognise: 'Recognise',
  consider: 'Consider',
  commit: 'Commit',
  offer: 'Offer',
  refuse: 'Refuse',
  release: 'Release',
  settle: 'Settle',
  remain: 'Remain',
};

export const COLOR_MODE_LABELS: Record<AtmosphericColorMode, string> = {
  fixed: 'Fixed optical palette',
  signal: 'Theme signal',
  contrast: 'Theme signal contrast',
};

export const MAX_ATMOSPHERIC_EFFECTS = 4;

export const DEFAULT_ATMOSPHERIC_EFFECT: AtmosphericEffectConfig = {
  id: 'atmosphere_1',
  name: 'Quiet corona',
  enabled: true,
  phenomenon: 'corona',
  source: 'focusMoon',
  narrative: 'gather',
  x: 50,
  y: 55,
  delay: 0,
  duration: 8,
  intensity: 0.62,
  previewSource: false,
  colorMode: 'fixed',
  color: '#eaf4ff',
  secondaryColor: '#b9d8ff',
  tertiaryColor: '#d8c7ff',

  ringCount: 4,
  innerRadius: 9,
  ringSpacing: 4.5,
  chromaticSpread: 0.24,
  softness: 1.4,
  opacity: 0.58,
  radialAsymmetry: 0.08,
  pulseDepth: 0.08,
  pulseDuration: 4.8,
  scintillation: 0.14,

  haloDiameter: 42,
  ringCompression: 0.68,
  mistDensity: 0.24,
  silhouetteOpacity: 0.2,
  edgeDiffusion: 5,
  radialIrregularity: 0.08,
  revealDuration: 2.4,
  mistFadeDuration: 2.8,

  lateralOffset: 22,
  pairSymmetry: 0.88,
  colorFringe: 0.22,
  brightness: 0.72,
  onsetDelay: 0.7,
  hoverDrift: 1.2,
  fadeOrder: 'together',

  beadCount: 9,
  beadRadius: 12,
  beadIrregularity: 0.62,
  beadSize: 3.8,
  beadBrightness: 0.94,
  beadSequence: 'irregular',
  ignitionSpread: 1.8,
  finalFlash: 0.76,

  targetX: 50,
  targetY: 82,
  pillarWidth: 4.5,
  pillarTaper: 0.46,
  verticalSoftness: 7,
  coreBrightness: 0.82,
  suspendedDensity: 0.46,
  riseTime: 1.6,
  holdTime: 3.2,
  decayTime: 2.4,
  residualShimmer: 0.28,

  contactRadius: 18,
  dewDensity: 0.48,
  retroBrightness: 0.58,
  localFalloff: 0.72,
  shimmerFrequency: 2.8,
  viewerAlignment: 0.12,
  dewPersistence: 0.76,

  trailLength: 34,
  descentSpeed: 5.4,
  evaporationHeight: 74,
  strandCount: 9,
  virgaFadeCurve: 'soft',
  lateralWind: 3,
  dropletBrightness: 0.52,
  terminalOpacity: 0,

  projectionScale: 2.15,
  perspectiveStretch: 1.12,
  projectionBlur: 5.5,
  projectionOpacity: 0.26,
  fogDepth: 0.62,
  motionLag: 0.7,
  haloIntensity: 0.22,
  projectionOffsetX: 8,
  projectionOffsetY: -22,
  distortionNoise: 0.16,
};

const clone = (effect: AtmosphericEffectConfig): AtmosphericEffectConfig => ({ ...effect });

export function newAtmosphericEffect(
  n: number,
  phenomenon: AtmosphericPhenomenon = 'corona',
): AtmosphericEffectConfig {
  return {
    ...DEFAULT_ATMOSPHERIC_EFFECT,
    id: `atmosphere_${n}`,
    name: PHENOMENON_LABELS[phenomenon].split(' · ')[0],
    phenomenon,
  };
}

export function migrateAtmosphericEffect(
  raw: Partial<AtmosphericEffectConfig> | undefined,
  n: number,
): AtmosphericEffectConfig {
  const phenomenon = raw?.phenomenon && raw.phenomenon in PHENOMENON_LABELS
    ? raw.phenomenon
    : 'corona';
  return {
    ...newAtmosphericEffect(n, phenomenon),
    ...(raw ?? {}),
    id: raw?.id || `atmosphere_${n}`,
  };
}

export interface AtmosphericStudy {
  label: string;
  note: string;
  effects: AtmosphericEffectConfig[];
}

const studyEffect = (
  phenomenon: AtmosphericPhenomenon,
  patch: Partial<AtmosphericEffectConfig>,
): AtmosphericEffectConfig => ({
  ...newAtmosphericEffect(1, phenomenon),
  ...patch,
});

export const ATMOSPHERIC_STUDIES: Record<string, AtmosphericStudy> = {
  quiet_corona: {
    label: 'Quiet Corona',
    note: 'Attention gathering around the focus moon without spectacle.',
    effects: [studyEffect('corona', {
      id: 'quiet_corona',
      name: 'Quiet corona',
      narrative: 'gather',
      ringCount: 5,
      innerRadius: 10,
      ringSpacing: 4.2,
      chromaticSpread: 0.16,
      softness: 1.8,
      opacity: 0.5,
      pulseDepth: 0.07,
      pulseDuration: 5.6,
      previewSource: true,
    })],
  },
  mist_recognition: {
    label: 'Mist Recognition',
    note: 'A relational “I see you” moment condensing through a quiet veil.',
    effects: [studyEffect('glory', {
      id: 'mist_recognition',
      name: 'Mist recognition',
      source: 'baily',
      narrative: 'recognise',
      // The Studio's stand-in Baily/moon is anchored here. Keeping the study
      // on that same point prevents the veil from drifting beside its subject.
      x: 50,
      y: 55,
      duration: 9,
      intensity: 0.58,
      // Mist Recognition is deliberately veil-first. Glory rings remain an
      // available control, but this study must not resemble Quiet Corona.
      opacity: 0,
      color: '#e8f5ff',
      secondaryColor: '#b8d7ff',
      tertiaryColor: '#dccbff',
      haloDiameter: 48,
      ringCompression: 0.74,
      mistDensity: 0.34,
      silhouetteOpacity: 0.24,
      edgeDiffusion: 6,
      previewSource: false,
    })],
  },
  shared_moon: {
    label: 'Shared Moon',
    note: 'Invitation and companionship held as two slightly imperfect side-lights.',
    effects: [studyEffect('moonDogs', {
      id: 'shared_moon',
      name: 'Shared moon',
      narrative: 'offer',
      duration: 8.5,
      intensity: 0.66,
      colorMode: 'signal',
      lateralOffset: 23,
      pairSymmetry: 0.84,
      colorFringe: 0.3,
      brightness: 0.78,
      onsetDelay: 0.9,
      hoverDrift: 1.5,
      previewSource: true,
    })],
  },
  threshold_beads: {
    label: 'Threshold Beads',
    note: 'A rare identity threshold resolving point by point around the lunar rim.',
    effects: [studyEffect('bailyBeads', {
      id: 'threshold_beads',
      name: 'Threshold beads',
      narrative: 'commit',
      delay: 0.7,
      duration: 5.6,
      intensity: 0.9,
      color: '#fff7dc',
      secondaryColor: '#d9f4ff',
      tertiaryColor: '#e5ccff',
      beadCount: 11,
      beadRadius: 11.5,
      beadIrregularity: 0.74,
      beadSize: 4.2,
      beadBrightness: 1,
      beadSequence: 'irregular',
      ignitionSpread: 2.1,
      finalFlash: 0.92,
      previewSource: true,
    })],
  },
  decision_pillar: {
    label: 'Decision Pillar',
    note: 'A deliberate line of light condenses from the focus moon toward the chosen point.',
    effects: [studyEffect('lightPillar', {
      id: 'decision_pillar',
      name: 'Decision pillar',
      narrative: 'commit',
      x: 50,
      y: 55,
      targetX: 50,
      targetY: 83,
      delay: 0.3,
      duration: 7.6,
      intensity: 0.74,
      color: '#fff3d6',
      secondaryColor: '#e0ebff',
      tertiaryColor: '#cbdcff',
      pillarWidth: 4.2,
      pillarTaper: 0.48,
      verticalSoftness: 7.5,
      coreBrightness: 0.84,
      suspendedDensity: 0.42,
      riseTime: 1.4,
      holdTime: 3.4,
      decayTime: 2.2,
      residualShimmer: 0.3,
      previewSource: false,
    })],
  },
  quiet_regard: {
    label: 'Quiet Regard',
    note: 'A private halo of dew-light stays close to the shared point of attention.',
    effects: [studyEffect('heiligenschein', {
      id: 'quiet_regard',
      name: 'Quiet regard',
      source: 'sharedMidpoint',
      narrative: 'remain',
      x: 50,
      y: 76,
      duration: 10,
      intensity: 0.46,
      color: '#fff9e8',
      secondaryColor: '#deefff',
      tertiaryColor: '#e8ddff',
      contactRadius: 20,
      dewDensity: 0.56,
      retroBrightness: 0.5,
      localFalloff: 0.78,
      shimmerFrequency: 3.4,
      viewerAlignment: 0.18,
      dewPersistence: 0.86,
      previewSource: false,
    })],
  },
  not_now: {
    label: 'Not Now',
    note: 'Fine rain begins a descent, then releases itself softly before contact.',
    effects: [studyEffect('virga', {
      id: 'not_now',
      name: 'Not now',
      source: 'pawHand',
      narrative: 'refuse',
      x: 50,
      y: 30,
      duration: 8,
      intensity: 0.58,
      color: '#eaf5ff',
      secondaryColor: '#badcf6',
      tertiaryColor: '#d8d0ee',
      trailLength: 38,
      descentSpeed: 5.8,
      evaporationHeight: 72,
      strandCount: 11,
      virgaFadeCurve: 'soft',
      lateralWind: 4.5,
      dropletBrightness: 0.62,
      terminalOpacity: 0,
      previewSource: false,
    })],
  },
  larger_weather: {
    label: 'Larger Weather',
    note: 'Baily stays foregrounded while their agency arrives as a magnified shadow in mist.',
    effects: [studyEffect('brockenSpectre', {
      id: 'larger_weather',
      name: 'Larger weather',
      source: 'baily',
      narrative: 'commit',
      x: 46,
      y: 66,
      duration: 10.5,
      intensity: 0.64,
      color: '#e4edff',
      secondaryColor: '#cbd8ff',
      tertiaryColor: '#ded2ff',
      projectionScale: 2.25,
      perspectiveStretch: 1.14,
      projectionBlur: 4.6,
      projectionOpacity: 0.48,
      fogDepth: 0.68,
      motionLag: 0.8,
      haloIntensity: 0.3,
      projectionOffsetX: 8,
      projectionOffsetY: -24,
      distortionNoise: 0.18,
      previewSource: true,
    })],
  },
};

export function cloneAtmosphericStudy(key: string): AtmosphericEffectConfig[] {
  return (ATMOSPHERIC_STUDIES[key]?.effects ?? []).map(clone);
}

export function atmosphereLifeMs(effects: AtmosphericEffectConfig[]): number {
  return effects.reduce(
    (max, effect) => effect.enabled ? Math.max(max, effect.delay + effect.duration) : max,
    0,
  ) * 1000;
}

export function resolvedAtmosphericColors(
  effect: AtmosphericEffectConfig,
): [string, string, string] {
  if (effect.colorMode === 'signal') {
    return ['var(--signal)', 'var(--signal-contrast)', 'var(--signal)'];
  }
  if (effect.colorMode === 'contrast') {
    return ['var(--signal-contrast)', 'var(--signal)', 'var(--signal-contrast)'];
  }
  return [effect.color, effect.secondaryColor, effect.tertiaryColor];
}
