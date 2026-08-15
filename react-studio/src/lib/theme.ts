// Theme fidelity: we import the planner's ACTUAL palettes and apply them with
// the same rules the app uses (theme.ts / envTheme.ts), so a react previewed
// here looks exactly like it will in the companion chat. No copies to drift.
import PALETTES_JSON from '../../../planner/src/lib/themes.json';
import { get, writable } from 'svelte/store';

const PALETTES = PALETTES_JSON as Record<string, Record<string, string>>;
const IMPORTED_THEME_STORAGE_KEY = 'react-studio-imported-themes-v1';
const IMPORTED_PREFIX = 'custom:';

export interface Canopy {
  stars: boolean;
  petals: boolean;
  aurora: boolean;
  storm: boolean;
  meteor: boolean;
}

export interface ImportedTheme {
  id: string;
  name: string;
  cssVars: Record<string, string>;
  canopy?: Partial<Canopy>;
}

const KNOWN_THEME_VARS = new Set(
  Object.values(PALETTES).flatMap((palette) => Object.keys(palette)),
);

function loadImportedThemes(): ImportedTheme[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORTED_THEME_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let importedRegistry = loadImportedThemes();
export const importedThemes = writable<ImportedTheme[]>(importedRegistry);

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
export function canopyFor(themeKey: string): Canopy {
  const imported = importedRegistry.find((theme) => theme.id === themeKey);
  if (imported) {
    return {
      stars: imported.canopy?.stars ?? imported.cssVars['--stars-active'] === '1',
      petals: imported.canopy?.petals ?? false,
      aurora: imported.canopy?.aurora ?? false,
      storm: imported.canopy?.storm ?? false,
      meteor: imported.canopy?.meteor ?? false,
    };
  }
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
  const imported = importedRegistry.find((theme) => theme.id === themeKey);
  const pal = imported?.cssVars ?? PALETTES[paletteKey(themeKey)] ?? {};
  const vars: Record<string, string> = { ...PALETTES.common, ...pal };
  if (vars['--gradient-start'] && vars['--gradient-end']) {
    vars['--ambient-gradient'] =
      `linear-gradient(135deg, ${vars['--gradient-start']} 0%, ${vars['--gradient-end']} 100%)`;
  }
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = hexLuminance(vars['--app-bg'] ?? vars['--gradient-start']) < 0.45 ? 'dark' : 'light';
}

export const currentTheme = writable<string>('twilight');

function slugifyThemeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'imported-theme';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanCssVars(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error('Theme is missing a cssVars object.');
  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!KNOWN_THEME_VARS.has(key) || typeof raw !== 'string') continue;
    const cssValue = raw.trim();
    if (!cssValue || /url\s*\(|@import|expression\s*\(/i.test(cssValue)) continue;
    clean[key] = cssValue;
  }
  if (!clean['--app-bg'] && !clean['--gradient-start']) {
    throw new Error('Theme needs --app-bg or --gradient-start so React Studio can classify it.');
  }
  return clean;
}

function cleanCanopy(value: unknown): Partial<Canopy> | undefined {
  if (!isRecord(value)) return undefined;
  const clean: Partial<Canopy> = {};
  for (const key of ['stars', 'petals', 'aurora', 'storm', 'meteor'] as const) {
    if (typeof value[key] === 'boolean') clean[key] = value[key];
  }
  return Object.keys(clean).length ? clean : undefined;
}

function normaliseImportedTheme(value: unknown, fallbackName: string): ImportedTheme {
  if (!isRecord(value)) throw new Error('Each imported theme must be a JSON object.');
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : fallbackName;
  const rawVars = isRecord(value.cssVars)
    ? value.cssVars
    : Object.keys(value).some((key) => key.startsWith('--'))
      ? value
      : undefined;
  return {
    id: `${IMPORTED_PREFIX}${slugifyThemeName(name)}`,
    name,
    cssVars: cleanCssVars(rawVars),
    canopy: cleanCanopy(value.canopy),
  };
}

export function importThemeJson(json: string, fallbackName = 'Imported Theme'): ImportedTheme[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.themes)
      ? parsed.themes
      : [parsed];
  if (!candidates.length) throw new Error('The theme pack is empty.');
  const themes = candidates.map((candidate, index) =>
    normaliseImportedTheme(candidate, candidates.length > 1 ? `${fallbackName} ${index + 1}` : fallbackName),
  );
  const merged = [...importedRegistry];
  for (const theme of themes) {
    const existing = merged.findIndex((item) => item.id === theme.id);
    if (existing >= 0) merged[existing] = theme;
    else merged.push(theme);
  }
  importedThemes.set(merged);
  return themes;
}

export function removeImportedTheme(themeId: string): void {
  if (!themeId.startsWith(IMPORTED_PREFIX)) return;
  if (get(currentTheme) === themeId) currentTheme.set('twilight');
  importedThemes.update((themes) => themes.filter((theme) => theme.id !== themeId));
}

export function isImportedTheme(themeId: string): boolean {
  return themeId.startsWith(IMPORTED_PREFIX);
}

if (typeof document !== 'undefined') {
  importedThemes.subscribe((themes) => {
    importedRegistry = themes;
    localStorage.setItem(IMPORTED_THEME_STORAGE_KEY, JSON.stringify(themes));
    const selected = get(currentTheme);
    if (selected.startsWith(IMPORTED_PREFIX)) applyTheme(selected);
  });
  currentTheme.subscribe((k) => applyTheme(k));
}
