// Theme fidelity: we import the planner's ACTUAL palettes and apply them with
// the same rules the app uses (theme.ts / envTheme.ts), so a react previewed
// here looks exactly like it will in the companion chat. No copies to drift.
import PALETTES_JSON from '../../../planner/src/lib/themes.json';
import { writable } from 'svelte/store';

const PALETTES = PALETTES_JSON as Record<string, Record<string, string>>;

// Real palette keys, in the same order the planner's theme dropdown shows them
// (minus the 'common' shared block and the auto/custom meta options).
export const THEME_ORDER = [
  'pre_dawn', 'sunrise', 'day', 'sweet', 'sunset', 'twilight',
  'night_new', 'night_full', 'storm', 'heatwave', 'aurora',
  'meteor_shower', 'lunar_eclipse', 'solar_eclipse',
] as const;

export const THEME_LABELS: Record<string, string> = {
  pre_dawn: 'Pre-Dawn', sunrise: 'Sunrise', day: 'Day', sweet: 'Sweet',
  sunset: 'Sunset', twilight: 'Twilight', night_new: 'Night (New Moon)',
  night_full: 'Night (Full Moon)', storm: 'Storm', heatwave: 'Heatwave',
  aurora: 'Aurora', meteor_shower: 'Meteor Shower',
  lunar_eclipse: 'Lunar Eclipse', solar_eclipse: 'Solar Eclipse',
};

// meteor_shower has no palette of its own in the app — it renders over the
// new-moon night palette. Mirror that here.
function paletteKey(themeKey: string): string {
  return themeKey === 'meteor_shower' ? 'night_new' : themeKey;
}

// Which ambient canopy a theme shows, mirroring envTheme.ts's flags.
export interface Canopy {
  stars: boolean;
  petals: boolean;
  aurora: boolean;
  storm: boolean;
  meteor: boolean;
}
export function canopyFor(themeKey: string): Canopy {
  const starThemes = ['pre_dawn', 'twilight', 'night_new', 'night_full', 'solar_eclipse', 'lunar_eclipse', 'aurora'];
  return {
    stars: starThemes.includes(themeKey),
    petals: themeKey === 'sweet',
    aurora: themeKey === 'aurora',
    storm: themeKey === 'storm',
    meteor: themeKey === 'meteor_shower',
  };
}

// Perceptual dark/light (same as the planner): luminance of --app-bg, not a
// string prefix, so twilight/pre-dawn register as dark correctly.
function hexLuminance(hex: string | undefined): number {
  const m = /^#?([0-9a-f]{6})/i.exec((hex ?? '').trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export function applyTheme(themeKey: string): void {
  const pal = PALETTES[paletteKey(themeKey)] ?? {};
  const vars: Record<string, string> = { ...PALETTES.common, ...pal };
  if (vars['--gradient-start'] && vars['--gradient-end']) {
    vars['--ambient-gradient'] =
      `linear-gradient(135deg, ${vars['--gradient-start']} 0%, ${vars['--gradient-end']} 100%)`;
  }
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = hexLuminance(vars['--app-bg']) < 0.45 ? 'dark' : 'light';
}

export const currentTheme = writable<string>('twilight');

if (typeof document !== 'undefined') {
  currentTheme.subscribe((k) => applyTheme(k));
}
