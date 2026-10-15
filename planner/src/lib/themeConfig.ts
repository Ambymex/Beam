// The designer and companion share these controls and the CSS they produce.
export const DEFAULT_THEME_SETTINGS = {
  gradientStart: '#101525', gradientEnd: '#1a2235',
  glassHex: '#19191e', glassOpacity: 0.5, glassBlurPx: 18,
  surfaceHex: '#121829', surfaceOpacity: 1,
  surface2Hex: '#172037', surface2Opacity: 1,
  signalHex: '#a24df0', signalGlowOpacity: 0.2, signalContrast: '#ffffff',
  moonHex: '#ffffff', starHex: '#ffffff', starsOn: false,
  borderOpacity: 0.12, border2Opacity: 0.06, hairlineOpacity: 0.03,
  textHex: '#f8fafc', textDimHex: '#94a3b8', textFaintHex: '#475569',
};

export type ThemeSettings = typeof DEFAULT_THEME_SETTINGS;

const RANGES: Partial<Record<keyof ThemeSettings, [number, number]>> = {
  glassOpacity: [0, 1], glassBlurPx: [0, 40],
  surfaceOpacity: [0, 1], surface2Opacity: [0, 1], signalGlowOpacity: [0, 0.5],
  borderOpacity: [0, 0.3], border2Opacity: [0, 0.2], hairlineOpacity: [0, 0.1],
};

export function patchThemeSettings(base: ThemeSettings, patch: unknown): ThemeSettings {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Theme settings must be an object of designer controls. Use {} to save the base look unchanged.');
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_THEME_SETTINGS, key)) throw new Error(`Unknown theme setting: ${key}. Use read_themes to see the designer controls.`);
    const field = key as keyof ThemeSettings;
    if (field === 'starsOn') {
      if (typeof value !== 'boolean') throw new Error('starsOn must be true or false.');
      result.starsOn = value;
    } else if (typeof DEFAULT_THEME_SETTINGS[field] === 'string') {
      if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) {
        throw new Error(`${key} must be a hex colour such as #182236.`);
      }
      const hex = value.length === 4 ? '#' + [...value.slice(1)].map(c => c + c).join('') : value;
      (result as Record<string, unknown>)[key] = hex.toLowerCase();
    } else {
      const [min, max] = RANGES[field]!;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${key} must be a number between ${min} and ${max}.`);
      }
      if (field === 'glassBlurPx' && !Number.isInteger(value)) throw new Error('glassBlurPx must be a whole number of pixels.');
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function interpolateHex(from: string, to: string, ratio: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => {
    const start = (a >> shift) & 255;
    return Math.round(start + (((b >> shift) & 255) - start) * ratio).toString(16).padStart(2, '0');
  }).join('');
}

export function buildThemeVars(s: ThemeSettings): Record<string, string> {
  return {
    '--gradient-start': s.gradientStart,
    '--gradient-end': s.gradientEnd,
    '--ambient-gradient': `linear-gradient(135deg, ${s.gradientStart} 0%, ${s.gradientEnd} 100%)`,
    '--app-bg': s.gradientStart,
    '--glass-bg': hexToRgba(s.glassHex, s.glassOpacity),
    '--glass-border': hexToRgba(s.glassHex, Math.min(1, s.glassOpacity + 0.25)),
    '--glass-blur': `${s.glassBlurPx}px`,
    '--surface': hexToRgba(s.surfaceHex, s.surfaceOpacity),
    '--surface-2': hexToRgba(s.surface2Hex, s.surface2Opacity),
    '--surface-3': hexToRgba(interpolateHex(s.surface2Hex, '#ffffff', 0.2), Math.min(1, s.surface2Opacity * 1.3)),
    '--signal': s.signalHex,
    '--signal-glow': hexToRgba(s.signalHex, s.signalGlowOpacity),
    '--signal-contrast': s.signalContrast,
    '--border': `rgba(255, 255, 255, ${s.borderOpacity})`,
    '--border-2': `rgba(255, 255, 255, ${s.border2Opacity})`,
    '--hairline': `rgba(255, 255, 255, ${s.hairlineOpacity})`,
    '--text': s.textHex,
    '--text-2': interpolateHex(s.textHex, s.textDimHex, 0.4),
    '--text-dim': s.textDimHex,
    '--text-faint': s.textFaintHex,
    '--moon-color': s.moonHex,
    '--star-color': s.starHex,
    '--stars-active': s.starsOn ? '1' : '0',
  };
}

export function readThemeSettings(vars: Record<string, string>, starsFallback = false): ThemeSettings {
  const s = { ...DEFAULT_THEME_SETTINGS, starsOn: starsFallback };
  const colours: Partial<Record<keyof ThemeSettings, string>> = {
    gradientStart: '--gradient-start', gradientEnd: '--gradient-end', glassHex: '--glass-bg',
    surfaceHex: '--surface', surface2Hex: '--surface-2', signalHex: '--signal',
    signalContrast: '--signal-contrast', moonHex: '--moon-color', starHex: '--star-color',
    textHex: '--text', textDimHex: '--text-dim', textFaintHex: '--text-faint',
  };
  for (const [key, property] of Object.entries(colours)) {
    let value = vars[property]?.trim();
    if (!value && (key === 'gradientStart' || key === 'gradientEnd')) value = vars['--app-bg']?.trim();
    if (!value) continue;
    if (/^#[\da-f]{6}$/i.test(value)) (s as Record<string, unknown>)[key] = value.toLowerCase();
    else if (/^#[\da-f]{3}$/i.test(value)) (s as Record<string, unknown>)[key] = '#' + [...value.slice(1)].map(c => c + c).join('').toLowerCase();
    else {
      const rgb = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i.exec(value);
      if (rgb) (s as Record<string, unknown>)[key] = '#' + rgb.slice(1).map(c => Number(c).toString(16).padStart(2, '0')).join('');
    }
  }
  const opacities = {
    glassOpacity: '--glass-bg', surfaceOpacity: '--surface', surface2Opacity: '--surface-2',
    signalGlowOpacity: '--signal-glow', borderOpacity: '--border', border2Opacity: '--border-2', hairlineOpacity: '--hairline',
  } as const;
  for (const [field, property] of Object.entries(opacities)) {
    const value = vars[property]?.trim();
    if (!value) continue;
    const alpha = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/i.exec(value);
    (s as Record<string, unknown>)[field] = alpha ? Number(alpha[1]) : 1;
  }
  const blur = parseInt(vars['--glass-blur']);
  if (Number.isFinite(blur)) s.glassBlurPx = blur;
  if (vars['--stars-active'] !== undefined) s.starsOn = vars['--stars-active'] === '1';
  return s;
}

export const THEME_VAR_KEYS = Object.keys(buildThemeVars(DEFAULT_THEME_SETTINGS));
