import { writable, derived, get } from 'svelte/store';
import { envThemeState } from './envTheme';

export type ThemeName = 'auto' | 'force-dark' | 'force-light';

const STORAGE_KEY = 'radial-planner-theme-v2';

function loadCustomTheme(): Record<string, string> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem('radial-planner-custom-theme');
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function load(): ThemeName {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    const v = localStorage.getItem(STORAGE_KEY);
    return (v === 'force-dark' || v === 'force-light') ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export const theme = writable<ThemeName>(load());

export const customThemeStore = writable<Record<string, string> | null>(loadCustomTheme());

// Apply CSS variables to the document root based on env theme or manual override.
// We subscribe to both the theme preference and the env state.
let currentMode: 'dark' | 'light' = 'dark'; // for meta tags
let currentEnvVars: Record<string, string> = {};
let currentCustom: Record<string, string> | null = loadCustomTheme();

// Must be initialized before the subscriptions below: they call applyTheme
// synchronously during module evaluation, which reads this list.
const CUSTOM_KEYS = [
  '--gradient-start',
  '--gradient-end',
  '--ambient-gradient',
  '--app-bg',
  '--glass-bg',
  '--glass-border',
  '--glass-blur',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--signal',
  '--signal-glow',
  '--signal-contrast',
  '--border',
  '--border-2',
  '--hairline',
  '--text',
  '--text-2',
  '--text-dim',
  '--text-faint'
];

envThemeState.subscribe(($env) => {
  currentEnvVars = $env.cssVars;
  applyTheme(load(), currentEnvVars);
});

theme.subscribe(($theme) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, $theme);
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
  applyTheme($theme, currentEnvVars);
});

customThemeStore.subscribe(($custom) => {
  currentCustom = $custom;
  try {
    if (typeof localStorage !== 'undefined') {
      if ($custom) {
        localStorage.setItem('radial-planner-custom-theme', JSON.stringify($custom));
      } else {
        localStorage.removeItem('radial-planner-custom-theme');
      }
    }
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
  
  if (typeof document !== 'undefined') {
    applyTheme(load(), currentEnvVars);
  }
});

function applyTheme(pref: ThemeName, envVars: Record<string, string>) {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  if (!currentCustom) {
    for (const key of CUSTOM_KEYS) {
      root.style.removeProperty(key);
    }
  }
  
  const activeVars: Record<string, string> = currentCustom ? { ...envVars, ...(currentCustom as Record<string, string>) } : envVars;
  
  if (currentCustom && currentCustom['--app-bg'] && !currentCustom['--ambient-gradient']) {
    root.style.removeProperty('--ambient-gradient');
    delete activeVars['--ambient-gradient'];
  }
  
  // If forced, we could apply static vars, but for now we'll just let envTheme run.
  // In a full implementation, force-dark might manually load the night palette.
  // For this v1, the env engine is the source of truth, and we just apply its vars.
  for (const [key, val] of Object.entries(activeVars)) {
    root.style.setProperty(key, val as string | null);
  }
  
  const isDark = pref === 'force-dark' || (pref === 'auto' && activeVars['--app-bg']?.startsWith('#0'));
  currentMode = isDark ? 'dark' : 'light';
  
  root.dataset.theme = currentMode;
  
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', activeVars['--app-bg'] ?? '#0d0d10');
  
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
  hubFrom: 'transparent',
  hubTo: 'transparent',
};

export const palette = derived(theme, () => VAR_PALETTE);

// Numeric lunar cycle (0–1) for SVG moon rendering in the hub
export const moonCycle = derived(envThemeState, ($env) => $env.lunarCycle);

// Export a label for the hub
export const envLabel = derived(envThemeState, ($env) => {
  return $env.themeName;
});
