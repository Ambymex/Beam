// 🐟 2D Fish Studio — Persisted Color Swatches Store
import { writable } from 'svelte/store';

const KEY = 'fish-studio-palette-swatches';

export interface ColorSwatch {
  id: string;
  hex: string;
  name?: string;
}

const DEFAULT_SWATCHES: ColorSwatch[] = [
  { id: 'sw_1', hex: '#70d6ff', name: 'Celestial Cyan' },
  { id: 'sw_2', hex: '#ff4d6d', name: 'Sakura Blush' },
  { id: 'sw_3', hex: '#ffd166', name: 'Sun Dog Gold' },
  { id: 'sw_4', hex: '#d62828', name: 'Vermilion' },
  { id: 'sw_5', hex: '#0c162d', name: 'Sapphire Core' },
  { id: 'sw_6', hex: '#ffffff', name: 'Porcelain Pearl' },
  { id: 'sw_7', hex: '#a8dadc', name: 'Glacial Frost' },
  { id: 'sw_8', hex: '#240046', name: 'Abyssal Violet' },
];

function loadSwatches(): ColorSwatch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_SWATCHES;
}

export const paletteSwatches = writable<ColorSwatch[]>(loadSwatches());

paletteSwatches.subscribe((list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota */
  }
});

export function addSwatch(hex: string, name?: string): void {
  paletteSwatches.update((list) => [
    ...list,
    { id: `sw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, hex, name },
  ]);
}

export function removeSwatch(id: string): void {
  paletteSwatches.update((list) => list.filter((s) => s.id !== id));
}

export function updateSwatch(id: string, newHex: string): void {
  paletteSwatches.update((list) =>
    list.map((s) => (s.id === id ? { ...s, hex: newHex } : s)),
  );
}

export function resetDefaultSwatches(): void {
  paletteSwatches.set(DEFAULT_SWATCHES);
}
