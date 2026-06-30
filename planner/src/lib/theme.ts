import { writable, derived } from 'svelte/store';
import { envThemeState } from './envTheme';

export type ThemeName = 'auto' | 'force-dark' | 'force-light';

const STORAGE_KEY = 'radial-planner-theme-v2';

function load(): ThemeName {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  return (v === 'force-dark' || v === 'force-light') ? v : 'auto';
}

export const theme = writable<ThemeName>(load());

// Apply CSS variables to the document root based on env theme or manual override.
// We subscribe to both the theme preference and the env state.
let currentMode: 'dark' | 'light' = 'dark'; // for meta tags

envThemeState.subscribe(($env) => {
  applyTheme(load(), $env.cssVars);
});

theme.subscribe(($theme) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, $theme);
  
  // Need to read the current envVars synchronously without getting stuck
  let vars = {};
  const unsub = envThemeState.subscribe(v => vars = v.cssVars);
  unsub();
  
  applyTheme($theme, vars);
});

function applyTheme(pref: ThemeName, envVars: Record<string, string>) {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  // If forced, we could apply static vars, but for now we'll just let envTheme run.
  // In a full implementation, force-dark might manually load the night palette.
  // For this v1, the env engine is the source of truth, and we just apply its vars.
  for (const [key, val] of Object.entries(envVars)) {
    root.style.setProperty(key, val);
  }
  
  const isDark = pref === 'force-dark' || (pref === 'auto' && envVars['--app-bg']?.startsWith('#0'));
  currentMode = isDark ? 'dark' : 'light';
  
  root.dataset.theme = currentMode;
  
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', envVars['--app-bg'] ?? '#0d0d10');
  
  const iconLink = document.querySelector('link[rel="icon"]');
  if (iconLink) iconLink.setAttribute('href', currentMode === 'light' ? '/icon-light.svg' : '/icon.svg');
}

export function toggleTheme() {
  theme.update((t) => (t === 'auto' ? 'force-dark' : t === 'force-dark' ? 'force-light' : 'auto'));
}

// ----- SVG palette. Semantic tokens consumed by the ring. -----
// Now mapped directly to CSS variables, so the SVG inherits the HTML theme automatically!
export interface Palette {
  ringDisc: string; 
  ringStroke: string; 
  laneOuter: string; 
  laneInner: string; 
  tickHour: string; 
  tickMin: string; 
  signal: string; 
  signalSoft: string; 
  handleCore: string; 
  neutralBlock: string; 
  createGhost: string; 
  textPrimary: string; 
  textDim: string; 
  tickLabel: string; 
  tickLabelMarker: string; 
  hubStroke: string; 
  hubFrom: string; 
  hubTo: string; 
}

const VAR_PALETTE: Palette = {
  ringDisc: 'var(--glass-bg)', // Glassmorphism base for the ring
  ringStroke: 'var(--border)',
  laneOuter: 'var(--border-2)',
  laneInner: 'var(--hairline)',
  tickHour: 'var(--border-2)',
  tickMin: 'var(--hairline)',
  signal: 'var(--signal)',
  signalSoft: 'var(--signal-glow)',
  handleCore: 'var(--signal-contrast)',
  neutralBlock: 'var(--text-faint)',
  createGhost: 'var(--text-dim)',
  textPrimary: 'var(--text)',
  textDim: 'var(--text-dim)',
  tickLabel: 'var(--text-faint)',
  tickLabelMarker: 'var(--text-2)',
  hubStroke: 'var(--border)',
  hubFrom: 'var(--surface-2)',
  hubTo: 'var(--surface)',
};

export const palette = derived(theme, () => VAR_PALETTE);

// Export moon phase icon for the hub
export const moonPhaseIcon = derived(envThemeState, ($env) => {
  // simple map from id to emoji (the env engine could provide this too)
  const map: Record<string, string> = {
    'new': '🌑', 'waxing_crescent': '🌒', 'first_quarter': '🌓', 'waxing_gibbous': '🌔',
    'full': '🌕', 'waning_gibbous': '🌖', 'last_quarter': '🌗', 'waning_crescent': '🌘'
  };
  return map[$env.lunarPhase] ?? '🌑';
});

// Export a label for the hub
export const envLabel = derived(envThemeState, ($env) => {
  return $env.themeName;
});
