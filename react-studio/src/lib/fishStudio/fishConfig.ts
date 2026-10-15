// 🐟 2D Fish Studio — Core Configuration & Data Models

export type DorsalPattern =
  | 'plain'
  | 'calico_patches'
  | 'metallic_scales'
  | 'lunar_emblem'
  | 'tempest_lightning'
  | 'rime_ice_crust'
  | 'stippling';

export type FinSweep = 'pointed' | 'rounded' | 'scalloped' | 'veil_wing';

export type TailMode = 'standard_fan' | 'veil_tail' | 'double_comet' | 'butterfly_drape';

export type CrownSpotType = 'circle' | 'star' | 'crescent' | 'diamond';

export type PulseWave =
  | 'static'
  | 'sine_heartbeat'
  | 'lunar_breath'
  | 'static_crackling'
  | 'aurora_shimmer';

export type ParticleSocket =
  | 'orbital_ring'
  | 'dorsal_crest'
  | 'fin_tips'
  | 'halo_crown'
  | 'submerged_aura';

export type ParticleShape =
  | 'sparkle'
  | 'petal'
  | 'star'
  | 'snowflake'
  | 'diamond_crystal'
  | 'ice_shard'
  | 'smoke_puff'
  | 'bubble'
  | 'lunar_mote';

export type EmitterGlowMode = 'follow' | 'fixed' | 'envelope' | 'none';

export type WaterEnvironment =
  | 'day_sunlit'
  | 'sunset_copper'
  | 'night_moonlit'
  | 'foggy_mist'
  | 'subterranean_cave';

export interface FishBodyConfig {
  length: number; // 120 - 240px
  headWidth: number; // 15 - 40px
  bodyWidth: number; // 25 - 65px mid swell
  tailWidth: number; // 6 - 20px peduncle taper
  noseRoundness: number; // 0.2 - 1.0
  baseColor: string; // Hex color
  gradientType: 'linear_spine' | 'radial_glow' | 'dual_tone';
  baseGradientEnd: string; // Secondary body hue
  underbellyColor: string; // Outer subsurface rim tone
  underbellyWidth: number; // 2 - 8px
  opacity: number; // 0.2 - 1.0
  shadowBlur: number; // 4 - 30px
  shadowColor: string; // rgba or hex
}

export interface FishDorsalConfig {
  pattern: DorsalPattern;
  markingColor: string;
  markingSecondaryColor: string;
  scaleSize: number; // 4 - 24px
  density: number; // 0.1 - 1.0
  blur: number; // 0 - 20px edge softness / blur
  blendMode: GlobalCompositeOperation;
  seed: number;
}

export interface FishFinsConfig {
  pectoralLength: number; // 20 - 70px
  pectoralWidth: number; // 10 - 45px
  pectoralSpread: number; // 20 - 65 deg
  sweep: FinSweep;
  finColor: string;
  finAccentColor: string;
  ribCount: number; // 0 - 8
  transparency: number; // 0.2 - 0.95
  flutterFreq: number; // 0.5 - 5.0 Hz
  flutterAmp: number; // 5 - 35 deg
  flutterPhaseLag: number; // 0.0 - 1.0
}

export interface FishTailConfig {
  mode: TailMode;
  length: number; // 35 - 120px
  width: number; // 20 - 85px
  baseColor: string;
  accentColor: string;
  striationCount: number; // 0 - 12
  striationAlpha: number; // 0.1 - 0.9
  swaySpeed: number; // 0.5 - 4.0 Hz
  wavePropagation: number; // 0.5 - 2.5
  tipWhipAmp: number; // 5 - 45 deg
}

export interface FishHeadConfig {
  whiskerLength: number; // 0 - 55px
  whiskerSpread: number; // 15 - 50 deg
  whiskerColor: string;
  whiskerDrag: number; // 0.1 - 0.9
  eyeColor: string;
  eyePupilGlow: string;
  eyeOrbitColor: string;
  eyeSize: number; // 2 - 8px
  crownSpot: {
    enabled: boolean;
    type: CrownSpotType;
    size: number; // 4 - 22px
    posX: number; // offset along head axis
    color: string;
    glow: boolean;
  };
}

export interface FishEmissionConfig {
  energy: number; // 0.0 - 3.0 HDR multiplier
  color: string;
  spineGlow: boolean;
  finMarginGlow: boolean;
  pulseWave: PulseWave;
  pulseSpeed: number; // 0.2 - 4.0 Hz
}

export interface FishEmitterLayer {
  id: string;
  name: string;
  enabled: boolean;
  socket: ParticleSocket;
  shape: ParticleShape;
  count: number; // 1 - 35
  spawnRate: number; // particles/sec
  speed: number; // 10 - 120 px/s
  radialExpansion: number; // 0 - 80 px
  orbitSpeed: number; // -4 to 4 rad/s
  turbulence: number; // 0 - 30 px jitter
  drag: number; // 0.85 - 0.99
  lifeMin: number; // 0.8 - 4.0 s
  lifeMax: number; // 1.2 - 6.0 s
  sizeStart: number;
  sizeMid: number;
  sizeEnd: number;
  colorStart: string;
  colorMid: string;
  colorEnd: string;
  alphaStart: number;
  alphaMid: number;
  alphaEnd: number;
  midStopPct: number; // 10 - 90%
  // Particle Glow Controls (React Studio Convention)
  glowMode: EmitterGlowMode;
  glowBlur: number; // 0 - 30px
  glowColor: string; // Used when glowMode === 'fixed'
  glowColorStart: string; // Used when glowMode === 'envelope'
  glowColorMid: string;
  glowColorEnd: string;
}

export interface FishConfig {
  id: string;
  label: string;
  family: string;
  moteType: string;
  eligible_ponds: string[];
  eligible_seasons: string[];
  eligible_weathers: string[];
  spawn_weight: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  treatment: string;

  body: FishBodyConfig;
  dorsal: FishDorsalConfig;
  fins: FishFinsConfig;
  tail: FishTailConfig;
  head: FishHeadConfig;
  emission: FishEmissionConfig;
  emitters: FishEmitterLayer[];
}

export const MAX_EMITTERS = 4;

export const DEFAULT_EMITTER_LAYER: FishEmitterLayer = {
  id: 'layer_1',
  name: 'Orbital Motes',
  enabled: true,
  socket: 'orbital_ring',
  shape: 'star',
  count: 12,
  spawnRate: 4,
  speed: 25,
  radialExpansion: 35,
  orbitSpeed: 1.2,
  turbulence: 6,
  drag: 0.96,
  lifeMin: 1.8,
  lifeMax: 3.2,
  sizeStart: 3,
  sizeMid: 8,
  sizeEnd: 2,
  colorStart: '#70d6ff',
  colorMid: '#ffffff',
  colorEnd: '#a0c4ff',
  alphaStart: 0.2,
  alphaMid: 0.9,
  alphaEnd: 0.0,
  midStopPct: 45,
  glowMode: 'follow',
  glowBlur: 10,
  glowColor: '#70d6ff',
  glowColorStart: '#70d6ff',
  glowColorMid: '#ffffff',
  glowColorEnd: '#a0c4ff',
};

// 🐟 Clean Slate Preset (Empty, pure starting canvas)
export const BLANK_FISH_CONFIG: FishConfig = {
  id: 'custom_species',
  label: 'New Species',
  family: 'pond_dweller',
  moteType: 'water_ripple',
  eligible_ponds: ['home_pond'],
  eligible_seasons: ['all'],
  eligible_weathers: ['all'],
  spawn_weight: 1.0,
  rarity: 'common',
  treatment: 'A peaceful koi swimming in clear water.',

  body: {
    length: 170,
    headWidth: 26,
    bodyWidth: 46,
    tailWidth: 11,
    noseRoundness: 0.75,
    baseColor: '#e9ecef',
    gradientType: 'dual_tone',
    baseGradientEnd: '#dee2e6',
    underbellyColor: '#ced4da',
    underbellyWidth: 3,
    opacity: 1.0,
    shadowBlur: 14,
    shadowColor: 'rgba(0, 0, 0, 0.45)',
  },

  dorsal: {
    pattern: 'plain',
    markingColor: '#d62828',
    markingSecondaryColor: '#f77f00',
    scaleSize: 12,
    density: 0.7,
    blur: 0,
    blendMode: 'source-over',
    seed: 42,
  },

  fins: {
    pectoralLength: 46,
    pectoralWidth: 24,
    pectoralSpread: 40,
    sweep: 'rounded',
    finColor: '#ffffff',
    finAccentColor: '#e9ecef',
    ribCount: 4,
    transparency: 0.75,
    flutterFreq: 1.8,
    flutterAmp: 16,
    flutterPhaseLag: 0.3,
  },

  tail: {
    mode: 'standard_fan',
    length: 65,
    width: 48,
    baseColor: '#ffffff',
    accentColor: '#e9ecef',
    striationCount: 6,
    striationAlpha: 0.4,
    swaySpeed: 1.4,
    wavePropagation: 1.5,
    tipWhipAmp: 20,
  },

  head: {
    whiskerLength: 26,
    whiskerSpread: 32,
    whiskerColor: '#ced4da',
    whiskerDrag: 0.5,
    eyeColor: '#212529',
    eyePupilGlow: '#ffffff',
    eyeOrbitColor: '#ced4da',
    eyeSize: 4.5,
    crownSpot: {
      enabled: false,
      type: 'circle',
      size: 10,
      posX: -8,
      color: '#d62828',
      glow: false,
    },
  },

  emission: {
    energy: 0.0,
    color: '#70d6ff',
    spineGlow: false,
    finMarginGlow: false,
    pulseWave: 'static',
    pulseSpeed: 1.0,
  },

  emitters: [],
};

export const DEFAULT_FISH_CONFIG: FishConfig = BLANK_FISH_CONFIG;

// 🐟 Preset Species Library for quick discovery and testing
export const FISH_PRESETS: Record<string, FishConfig> = {
  blank_canvas: BLANK_FISH_CONFIG,

  lunar_glimmerfin: {
    id: 'lunar_glimmerfin',
    label: 'Glimmerfin Sovereign',
    family: 'celestial_lunar',
    moteType: 'full_moon',
    eligible_ponds: ['sky_pond', 'home_pond'],
    eligible_seasons: ['all'],
    eligible_weathers: ['clear', 'aurora'],
    spawn_weight: 1.0,
    rarity: 'epic',
    treatment: 'Midnight sapphire core trailing shimmering lunar star motes.',

    body: {
      length: 175,
      headWidth: 26,
      bodyWidth: 46,
      tailWidth: 11,
      noseRoundness: 0.75,
      baseColor: '#0c162d',
      gradientType: 'linear_spine',
      baseGradientEnd: '#1e3860',
      underbellyColor: '#3a86ff',
      underbellyWidth: 4,
      opacity: 0.94,
      shadowBlur: 16,
      shadowColor: 'rgba(5, 10, 25, 0.65)',
    },

    dorsal: {
      pattern: 'lunar_emblem',
      markingColor: '#e0e8ff',
      markingSecondaryColor: '#80bfff',
      scaleSize: 14,
      density: 0.85,
      blendMode: 'screen',
      seed: 42,
    },

    fins: {
      pectoralLength: 48,
      pectoralWidth: 26,
      pectoralSpread: 42,
      sweep: 'veil_wing',
      finColor: '#5390d9',
      finAccentColor: '#90e0ef',
      ribCount: 4,
      transparency: 0.68,
      flutterFreq: 1.8,
      flutterAmp: 18,
      flutterPhaseLag: 0.35,
    },

    tail: {
      mode: 'veil_tail',
      length: 78,
      width: 52,
      baseColor: '#4361ee',
      accentColor: '#70d6ff',
      striationCount: 7,
      striationAlpha: 0.6,
      swaySpeed: 1.4,
      wavePropagation: 1.6,
      tipWhipAmp: 24,
    },

    head: {
      whiskerLength: 32,
      whiskerSpread: 34,
      whiskerColor: '#bde0fe',
      whiskerDrag: 0.55,
      eyeColor: '#050c1e',
      eyePupilGlow: '#00f5d4',
      eyeOrbitColor: '#70d6ff',
      eyeSize: 4.5,
      crownSpot: {
        enabled: true,
        type: 'crescent',
        size: 11,
        posX: -8,
        color: '#e2f1ff',
        glow: true,
      },
    },

    emission: {
      energy: 2.2,
      color: '#70d6ff',
      spineGlow: true,
      finMarginGlow: true,
      pulseWave: 'lunar_breath',
      pulseSpeed: 1.1,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_orbit',
        name: 'Lunar Orbits',
        socket: 'orbital_ring',
        shape: 'star',
        count: 10,
        colorStart: '#a0c4ff',
        colorMid: '#ffffff',
        colorEnd: '#70d6ff',
      },
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_tail_dust',
        name: 'Trailing Stardust',
        socket: 'fin_tips',
        shape: 'sparkle',
        count: 16,
        speed: 40,
        orbitSpeed: 0,
        radialExpansion: 20,
        colorStart: '#70d6ff',
        colorMid: '#e2f1ff',
        colorEnd: '#3a86ff',
        lifeMin: 1.2,
        lifeMax: 2.4,
        sizeStart: 5,
        sizeMid: 7,
        sizeEnd: 1,
      },
    ],
  },

  tancho_sun_dog: {
    id: 'tancho_sun_dog',
    label: 'Tancho Sun Dog',
    family: 'solar_radiant',
    moteType: 'sun_corona',
    eligible_ponds: ['home_pond', 'golden_stream'],
    eligible_seasons: ['summer', 'all'],
    eligible_weathers: ['clear', 'heatwave'],
    spawn_weight: 0.8,
    rarity: 'rare',
    treatment: 'Warm gilded core with a brilliant vermilion sun crown and corona motes.',

    body: {
      length: 165,
      headWidth: 28,
      bodyWidth: 48,
      tailWidth: 12,
      noseRoundness: 0.85,
      baseColor: '#fffcf2',
      gradientType: 'radial_glow',
      baseGradientEnd: '#f8edeb',
      underbellyColor: '#fca311',
      underbellyWidth: 4,
      opacity: 0.98,
      shadowBlur: 14,
      shadowColor: 'rgba(40, 20, 5, 0.45)',
    },

    dorsal: {
      pattern: 'metallic_scales',
      markingColor: '#e09f3e',
      markingSecondaryColor: '#fff3b0',
      scaleSize: 11,
      density: 0.6,
      blendMode: 'overlay',
      seed: 88,
    },

    fins: {
      pectoralLength: 42,
      pectoralWidth: 24,
      pectoralSpread: 38,
      sweep: 'rounded',
      finColor: '#fdf0d5',
      finAccentColor: '#e09f3e',
      ribCount: 5,
      transparency: 0.75,
      flutterFreq: 2.2,
      flutterAmp: 16,
      flutterPhaseLag: 0.25,
    },

    tail: {
      mode: 'standard_fan',
      length: 62,
      width: 46,
      baseColor: '#fefae0',
      accentColor: '#f77f00',
      striationCount: 8,
      striationAlpha: 0.5,
      swaySpeed: 1.6,
      wavePropagation: 1.4,
      tipWhipAmp: 18,
    },

    head: {
      whiskerLength: 26,
      whiskerSpread: 30,
      whiskerColor: '#d4a373',
      whiskerDrag: 0.45,
      eyeColor: '#2b2d42',
      eyePupilGlow: '#fca311',
      eyeOrbitColor: '#e76f51',
      eyeSize: 4.8,
      crownSpot: {
        enabled: true,
        type: 'circle',
        size: 15,
        posX: -10,
        color: '#d62828',
        glow: true,
      },
    },

    emission: {
      energy: 1.6,
      color: '#fcbf49',
      spineGlow: true,
      finMarginGlow: true,
      pulseWave: 'sine_heartbeat',
      pulseSpeed: 1.3,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_sun_halo',
        name: 'Sun Crown Halo',
        socket: 'halo_crown',
        shape: 'sparkle',
        count: 8,
        radialExpansion: 22,
        colorStart: '#f77f00',
        colorMid: '#fcbf49',
        colorEnd: '#eae2b7',
        sizeStart: 3,
        sizeMid: 7,
        sizeEnd: 2,
      },
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_ember_crest',
        name: 'Dorsal Embers',
        socket: 'dorsal_crest',
        shape: 'diamond_crystal',
        count: 12,
        speed: 35,
        orbitSpeed: 0,
        colorStart: '#e63946',
        colorMid: '#fca311',
        colorEnd: '#fff3b0',
        lifeMin: 1.0,
        lifeMax: 2.2,
      },
    ],
  },

  rimefin_ice_crystal: {
    id: 'rimefin_ice_crystal',
    label: 'Rimefin Frost Monarch',
    family: 'cryo_frost',
    moteType: 'frost_snowflake',
    eligible_ponds: ['frozen_mere', 'sky_pond'],
    eligible_seasons: ['winter'],
    eligible_weathers: ['snow', 'blizzard'],
    spawn_weight: 0.6,
    rarity: 'rare',
    treatment: 'Glacial crystalline body rimmed with faceted ice crusts and diamond motes.',

    body: {
      length: 185,
      headWidth: 24,
      bodyWidth: 42,
      tailWidth: 10,
      noseRoundness: 0.6,
      baseColor: '#0b2545',
      gradientType: 'linear_spine',
      baseGradientEnd: '#134074',
      underbellyColor: '#8da9c4',
      underbellyWidth: 5,
      opacity: 0.88,
      shadowBlur: 18,
      shadowColor: 'rgba(5, 20, 45, 0.7)',
    },

    dorsal: {
      pattern: 'rime_ice_crust',
      markingColor: '#eef4f8',
      markingSecondaryColor: '#8da9c4',
      scaleSize: 16,
      density: 0.9,
      blendMode: 'screen',
      seed: 104,
    },

    fins: {
      pectoralLength: 54,
      pectoralWidth: 22,
      pectoralSpread: 48,
      sweep: 'pointed',
      finColor: '#8da9c4',
      finAccentColor: '#eef4f8',
      ribCount: 6,
      transparency: 0.6,
      flutterFreq: 1.4,
      flutterAmp: 22,
      flutterPhaseLag: 0.4,
    },

    tail: {
      mode: 'double_comet',
      length: 85,
      width: 58,
      baseColor: '#134074',
      accentColor: '#eef4f8',
      striationCount: 9,
      striationAlpha: 0.7,
      swaySpeed: 1.2,
      wavePropagation: 1.8,
      tipWhipAmp: 30,
    },

    head: {
      whiskerLength: 38,
      whiskerSpread: 40,
      whiskerColor: '#eef4f8',
      whiskerDrag: 0.65,
      eyeColor: '#0b2545',
      eyePupilGlow: '#a8dadc',
      eyeOrbitColor: '#eef4f8',
      eyeSize: 4.2,
      crownSpot: {
        enabled: true,
        type: 'diamond',
        size: 12,
        posX: -6,
        color: '#eef4f8',
        glow: true,
      },
    },

    emission: {
      energy: 2.0,
      color: '#a8dadc',
      spineGlow: true,
      finMarginGlow: true,
      pulseWave: 'static_crackling',
      pulseSpeed: 1.5,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_ice_shards',
        name: 'Glacial Shards',
        socket: 'fin_tips',
        shape: 'ice_shard',
        count: 14,
        speed: 45,
        orbitSpeed: 0,
        colorStart: '#ffffff',
        colorMid: '#a8dadc',
        colorEnd: '#457b9d',
        lifeMin: 1.4,
        lifeMax: 2.8,
        sizeStart: 4,
        sizeMid: 9,
        sizeEnd: 2,
      },
    ],
  },

  petalfin_cherry_blossom: {
    id: 'petalfin_cherry_blossom',
    label: 'Petalfin Blossom Gossamer',
    family: 'flora_sakura',
    moteType: 'sakura_petal',
    eligible_ponds: ['home_pond', 'blossom_grove'],
    eligible_seasons: ['spring', 'all'],
    eligible_weathers: ['clear', 'petal_rain'],
    spawn_weight: 1.2,
    rarity: 'uncommon',
    treatment: 'Porcelain blush scales with gossamer butterfly drape fins drifting cherry blossoms.',

    body: {
      length: 160,
      headWidth: 25,
      bodyWidth: 44,
      tailWidth: 11,
      noseRoundness: 0.8,
      baseColor: '#fff0f3',
      gradientType: 'radial_glow',
      baseGradientEnd: '#ffccd5',
      underbellyColor: '#ff758f',
      underbellyWidth: 4,
      opacity: 0.92,
      shadowBlur: 12,
      shadowColor: 'rgba(40, 10, 20, 0.4)',
    },

    dorsal: {
      pattern: 'stippling',
      markingColor: '#ff4d6d',
      markingSecondaryColor: '#c9184a',
      scaleSize: 8,
      density: 0.7,
      blendMode: 'source-over',
      seed: 27,
    },

    fins: {
      pectoralLength: 50,
      pectoralWidth: 32,
      pectoralSpread: 45,
      sweep: 'veil_wing',
      finColor: '#ffb3c1',
      finAccentColor: '#fff0f3',
      ribCount: 6,
      transparency: 0.7,
      flutterFreq: 1.6,
      flutterAmp: 20,
      flutterPhaseLag: 0.3,
    },

    tail: {
      mode: 'butterfly_drape',
      length: 82,
      width: 70,
      baseColor: '#ff8fa3',
      accentColor: '#fff0f3',
      striationCount: 10,
      striationAlpha: 0.55,
      swaySpeed: 1.1,
      wavePropagation: 2.0,
      tipWhipAmp: 26,
    },

    head: {
      whiskerLength: 28,
      whiskerSpread: 32,
      whiskerColor: '#ff758f',
      whiskerDrag: 0.5,
      eyeColor: '#590d22',
      eyePupilGlow: '#ff4d6d',
      eyeOrbitColor: '#ffb3c1',
      eyeSize: 4.6,
      crownSpot: {
        enabled: true,
        type: 'circle',
        size: 9,
        posX: -8,
        color: '#ff4d6d',
        glow: false,
      },
    },

    emission: {
      energy: 0.8,
      color: '#ff758f',
      spineGlow: false,
      finMarginGlow: true,
      pulseWave: 'aurora_shimmer',
      pulseSpeed: 0.8,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_petals',
        name: 'Blossom Drift',
        socket: 'fin_tips',
        shape: 'petal',
        count: 18,
        speed: 30,
        orbitSpeed: 0,
        colorStart: '#ffffff',
        colorMid: '#ffb3c1',
        colorEnd: '#ff4d6d',
        lifeMin: 2.0,
        lifeMax: 4.0,
        sizeStart: 6,
        sizeMid: 10,
        sizeEnd: 4,
      },
    ],
  },

  pyrocumulonimbus_magma: {
    id: 'pyrocumulonimbus_magma',
    label: 'Pyrocumulonimbus Drake',
    family: 'elemental_volcano',
    moteType: 'magma_spark',
    eligible_ponds: ['caldera_depths', 'subterranean_cave'],
    eligible_seasons: ['all'],
    eligible_weathers: ['storm', 'thunder'],
    spawn_weight: 0.4,
    rarity: 'legendary',
    treatment: 'Obsidian basalt core fractured with branching magma veins and ash motes.',

    body: {
      length: 195,
      headWidth: 29,
      bodyWidth: 52,
      tailWidth: 14,
      noseRoundness: 0.65,
      baseColor: '#121113',
      gradientType: 'linear_spine',
      baseGradientEnd: '#2b2a30',
      underbellyColor: '#e71d36',
      underbellyWidth: 6,
      opacity: 1.0,
      shadowBlur: 22,
      shadowColor: 'rgba(20, 5, 0, 0.8)',
    },

    dorsal: {
      pattern: 'tempest_lightning',
      markingColor: '#ff9f1c',
      markingSecondaryColor: '#ff0054',
      scaleSize: 18,
      density: 0.95,
      blendMode: 'screen',
      seed: 999,
    },

    fins: {
      pectoralLength: 56,
      pectoralWidth: 26,
      pectoralSpread: 50,
      sweep: 'scalloped',
      finColor: '#3a0ca3',
      finAccentColor: '#ff0054',
      ribCount: 6,
      transparency: 0.85,
      flutterFreq: 2.4,
      flutterAmp: 24,
      flutterPhaseLag: 0.4,
    },

    tail: {
      mode: 'double_comet',
      length: 90,
      width: 65,
      baseColor: '#240046',
      accentColor: '#ff5400',
      striationCount: 11,
      striationAlpha: 0.75,
      swaySpeed: 1.8,
      wavePropagation: 2.2,
      tipWhipAmp: 34,
    },

    head: {
      whiskerLength: 44,
      whiskerSpread: 46,
      whiskerColor: '#ff9f1c',
      whiskerDrag: 0.6,
      eyeColor: '#0d0221',
      eyePupilGlow: '#ff0054',
      eyeOrbitColor: '#ff9f1c',
      eyeSize: 5.2,
      crownSpot: {
        enabled: true,
        type: 'diamond',
        size: 14,
        posX: -7,
        color: '#ffbe0b',
        glow: true,
      },
    },

    emission: {
      energy: 2.8,
      color: '#ff5400',
      spineGlow: true,
      finMarginGlow: true,
      pulseWave: 'static_crackling',
      pulseSpeed: 2.2,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_magma_smoke',
        name: 'Ash & Smoke Puffs',
        socket: 'dorsal_crest',
        shape: 'smoke_puff',
        count: 15,
        speed: 35,
        orbitSpeed: 0,
        colorStart: '#ffbe0b',
        colorMid: '#ff5400',
        colorEnd: '#333333',
        lifeMin: 1.2,
        lifeMax: 2.5,
        sizeStart: 4,
        sizeMid: 12,
        sizeEnd: 16,
        alphaStart: 0.8,
        alphaMid: 0.6,
        alphaEnd: 0.0,
      },
    ],
  },

  kohaku_classic: {
    id: 'kohaku_classic',
    label: 'Kohaku Vermilion Pearl',
    family: 'classic_pond',
    moteType: 'water_ripple',
    eligible_ponds: ['home_pond', 'rock_garden'],
    eligible_seasons: ['all'],
    eligible_weathers: ['all'],
    spawn_weight: 1.5,
    rarity: 'common',
    treatment: 'Pristine porcelain white scales adorned with organic vermilion calico markings.',

    body: {
      length: 170,
      headWidth: 27,
      bodyWidth: 47,
      tailWidth: 12,
      noseRoundness: 0.8,
      baseColor: '#fafaff',
      gradientType: 'radial_glow',
      baseGradientEnd: '#eef0f2',
      underbellyColor: '#d62828',
      underbellyWidth: 3,
      opacity: 0.96,
      shadowBlur: 14,
      shadowColor: 'rgba(10, 20, 30, 0.45)',
    },

    dorsal: {
      pattern: 'calico_patches',
      markingColor: '#d62828',
      markingSecondaryColor: '#f77f00',
      scaleSize: 16,
      density: 0.75,
      blendMode: 'source-over',
      seed: 15,
    },

    fins: {
      pectoralLength: 44,
      pectoralWidth: 24,
      pectoralSpread: 40,
      sweep: 'rounded',
      finColor: '#ffffff',
      finAccentColor: '#e0e1dd',
      ribCount: 5,
      transparency: 0.7,
      flutterFreq: 1.9,
      flutterAmp: 16,
      flutterPhaseLag: 0.25,
    },

    tail: {
      mode: 'standard_fan',
      length: 65,
      width: 48,
      baseColor: '#ffffff',
      accentColor: '#e0e1dd',
      striationCount: 7,
      striationAlpha: 0.45,
      swaySpeed: 1.5,
      wavePropagation: 1.5,
      tipWhipAmp: 20,
    },

    head: {
      whiskerLength: 28,
      whiskerSpread: 32,
      whiskerColor: '#d62828',
      whiskerDrag: 0.5,
      eyeColor: '#1d3557',
      eyePupilGlow: '#ffffff',
      eyeOrbitColor: '#d62828',
      eyeSize: 4.5,
      crownSpot: {
        enabled: false,
        type: 'circle',
        size: 10,
        posX: -6,
        color: '#d62828',
        glow: false,
      },
    },

    emission: {
      energy: 0.0,
      color: '#ffffff',
      spineGlow: false,
      finMarginGlow: false,
      pulseWave: 'static',
      pulseSpeed: 1.0,
    },

    emitters: [
      {
        ...DEFAULT_EMITTER_LAYER,
        id: 'emitter_bubbles',
        name: 'Ambient Water Ripples',
        socket: 'submerged_aura',
        shape: 'bubble',
        count: 8,
        speed: 20,
        orbitSpeed: 0,
        colorStart: '#ffffff',
        colorMid: '#a2d2ff',
        colorEnd: '#bde0fe',
        lifeMin: 1.5,
        lifeMax: 3.0,
        sizeStart: 2,
        sizeMid: 6,
        sizeEnd: 8,
        alphaStart: 0.4,
        alphaMid: 0.7,
        alphaEnd: 0.0,
      },
    ],
  },
};

export function migrateFishConfig(raw: any): FishConfig {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_FISH_CONFIG));
  }
  const base = JSON.parse(JSON.stringify(DEFAULT_FISH_CONFIG));
  return {
    ...base,
    ...raw,
    body: { ...base.body, ...(raw.body || {}) },
    dorsal: { blur: 0, ...base.dorsal, ...(raw.dorsal || {}) },
    fins: { ...base.fins, ...(raw.fins || {}) },
    tail: { ...base.tail, ...(raw.tail || {}) },
    head: {
      ...base.head,
      ...(raw.head || {}),
      crownSpot: { ...base.head.crownSpot, ...(raw.head?.crownSpot || {}) },
    },
    emission: { ...base.emission, ...(raw.emission || {}) },
    emitters: Array.isArray(raw.emitters)
      ? raw.emitters.map((e: any, i: number) => ({
          ...DEFAULT_EMITTER_LAYER,
          ...e,
          glowMode: e.glowMode || 'follow',
          glowBlur: e.glowBlur ?? 10,
          glowColor: e.glowColor || e.colorStart || '#70d6ff',
          glowColorStart: e.glowColorStart || e.colorStart || '#70d6ff',
          glowColorMid: e.glowColorMid || e.colorMid || '#ffffff',
          glowColorEnd: e.glowColorEnd || e.colorEnd || '#a0c4ff',
          id: e.id || `layer_${i + 1}`,
        }))
      : [],
  };
}
