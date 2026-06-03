// Theme system (light / dark). The app's load-bearing rule is "luminosity is the
// signal, hue belongs to vibes" (§2) — so a theme isn't a recolour, it's an
// INVERSION of the signal logic: the bright white glow that means "now" /
// selection / cascade-flag on a dark ground would VANISH on paper, so on light
// the signal becomes a dark, heavier mark instead. Same meaning, flipped value.
//
// The 77 vibe hexes are never touched here — they're the user's data (sacred).
// Only the chrome and the ring's structural marks are themed.

import { writable, derived } from 'svelte/store';

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'radial-planner-theme-v1';

function load(): ThemeName {
  if (typeof localStorage === 'undefined') return 'dark';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' ? 'light' : 'dark';
}

export const theme = writable<ThemeName>(load());

// Apply to <html data-theme> (drives CSS variables for the chrome) and persist.
theme.subscribe((value) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = value;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'light' ? '#f4f1ea' : '#0d0d10');
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
  if (typeof caches !== 'undefined') {
    caches.open('radial-planner-theme')
      .then((cache) => {
        cache.put('/theme', new Response(value));
      })
      .catch(() => {});
  }
});

export function toggleTheme() {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
}

// ----- SVG palette. Semantic tokens consumed by the ring + subdial. -----
export interface Palette {
  ringDisc: string; // backdrop disc fill
  ringStroke: string; // disc rim
  laneOuter: string; // lane band outline (outer)
  laneInner: string; // lane band outline (inner)
  tickHour: string; // hour spoke
  tickMin: string; // 15-min tick
  signal: string; // THE luminosity mark: now / selection / handles / cascade
  signalSoft: string; // the consumed now-wedge fill (very low opacity)
  handleCore: string; // the inner dot of a handle (opposite of signal)
  neutralBlock: string; // placeholder block fill (no vibe armed)
  createGhost: string; // live-draw preview when no vibe armed
  textPrimary: string;
  textDim: string;
  tickLabel: string; // ordinary hour numbers
  tickLabelMarker: string; // noon / midnight
  hubStroke: string;
  hubFrom: string; // hub radial-gradient inner
  hubTo: string; // hub radial-gradient outer
  // subdial (Nautilus)
  dialFaceFrom: string;
  dialFaceTo: string;
  dialBezelA: string;
  dialBezelB: string;
  dialBezelC: string;
  dialInner: string;
  dialGrooveDark: string;
  dialGrooveLight: string;
  dialTickMajor: string;
  dialTickMinor: string;
  dialArc: string;
  dialText: string;
  dialTextDim: string;
}

const DARK: Palette = {
  ringDisc: '#0d0d10', // same as the page — the rim/lanes/ticks draw the circle
  ringStroke: '#26262e',
  laneOuter: '#23232b',
  laneInner: '#1a1a20',
  tickHour: '#33333d',
  tickMin: '#26262e',
  signal: '#fdfdff',
  signalSoft: '#ffffff',
  handleCore: '#0d0d10',
  neutralBlock: '#6a6a78',
  createGhost: '#b9b9c8',
  textPrimary: '#e7e7ea',
  textDim: '#5d5d68',
  tickLabel: '#7c7c88',
  tickLabelMarker: '#cfcfd6',
  hubStroke: '#2c2c35',
  hubFrom: '#16161b',
  hubTo: '#0d0d10',
  dialFaceFrom: '#20212a',
  dialFaceTo: '#101117',
  dialBezelA: '#3a3c47',
  dialBezelB: '#23242c',
  dialBezelC: '#34363f',
  dialInner: '#15161c',
  dialGrooveDark: '#000000',
  dialGrooveLight: '#3a3c48',
  dialTickMajor: '#9a9cab',
  dialTickMinor: '#54565f',
  dialArc: '#e9eaf0',
  dialText: '#cfd0d8',
  dialTextDim: '#5d5e68',
};

// Warm paper-white — a nod to the Prismacolor paper the system was born on.
// Signal flips to near-black so the "now/selection" marks read on the page.
const LIGHT: Palette = {
  ringDisc: '#f4f1ea', // SAME as the paper page — no distinct grey disc; the
  // rim + lanes + ticks draw the circle. (The old French-grey disc read as an
  // emotion to the user — synesthesia QA. The consumed sweep is now frosted
  // glass, not a deeper grey.)
  ringStroke: '#cdc6b6',
  laneOuter: '#d8d1c2',
  laneInner: '#e2dccf',
  tickHour: '#b3aa96',
  tickMin: '#cfc8b8',
  signal: '#262019', // dark warm ink — the inverted luminosity signal
  signalSoft: '#ffffff', // consumed wedge = frosted-glass white (luminosity, not grey)
  handleCore: '#f4f1ea', // handle inner dot = the paper colour
  neutralBlock: '#9c9483',
  createGhost: '#6f675a',
  textPrimary: '#2c2620',
  textDim: '#9a9080',
  tickLabel: '#9a9080',
  tickLabelMarker: '#5c5346',
  hubStroke: '#cdc6b6',
  hubFrom: '#f7f3ec',
  hubTo: '#ece6da',
  // subdial keeps a steel instrument feel even on paper (a watch face),
  // but lightened so it sits on the page rather than punching a hole in it.
  dialFaceFrom: '#e7e1d4',
  dialFaceTo: '#d8d0bf',
  dialBezelA: '#cfc8b8',
  dialBezelB: '#b8b09e',
  dialBezelC: '#ddd6c7',
  dialInner: '#cbc3b2',
  dialGrooveDark: '#a89f8b',
  dialGrooveLight: '#f3efe6',
  dialTickMajor: '#6c6354',
  dialTickMinor: '#a89f8b',
  dialArc: '#3a2f20',
  dialText: '#4c4438',
  dialTextDim: '#9a9080',
};

export const palette = derived(theme, ($t): Palette => ($t === 'light' ? LIGHT : DARK));
