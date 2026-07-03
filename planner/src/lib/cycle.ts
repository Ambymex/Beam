// Spatial cycle tracker (§11). The user thinks in WHERE-AM-I (a position you can
// see), never WHICH-DAY (a number to recall) — so the cycle is a marker on a
// subdial, never "CD 14" as the primary representation. Manual entry for now
// (fits the morning ritual); auto-count from a logged start is a later toggle,
// but the DISPLAY stays positional regardless.
//
// Colour stays sacred (§2): the subdial signals through luminosity / glow /
// notch only — never a hue, and pointedly never the pink/red every other
// tracker reaches for, because those hues already mean vibes here.

import { writable } from 'svelte/store';

export interface CycleState {
  length: number; // days in the cycle (varies between people and months)
  position: number; // current day-position, 1..length
}

const STORAGE_KEY = 'radial-planner-cycle-v1';
const DEFAULT: CycleState = { length: 28, position: 1 };
export const MIN_LENGTH = 14;
export const MAX_LENGTH = 60;

function clampLength(n: number): number {
  return Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.round(n)));
}

// Wrap a raw position into 1..length (so dragging past the end loops cleanly).
export function wrapPosition(p: number, length: number): number {
  const z = Math.round(p) - 1;
  return (((z % length) + length) % length) + 1;
}

function load(): CycleState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw) as CycleState;
    const length = clampLength(v.length ?? DEFAULT.length);
    return { length, position: wrapPosition(v.position ?? 1, length) };
  } catch {
    return { ...DEFAULT };
  }
}

export const cycle = writable<CycleState>(load());

// TEMP DIAGNOSTIC (remove once the iOS dial-drag bug is confirmed fixed):
// live trace of the dial's pointer pipeline, rendered in CycleEditor so the
// failure point is visible on-device without a console.
export const dialDebug = writable<string>('debug: waiting for touch…');

cycle.subscribe((value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode — still works in-memory */
  }
});

// ----- pure position ↔ angle geometry (testable, svelte-free) -----
// Day 1 sits at the top of the subdial; the marker advances clockwise. Fraction
// 0 = day 1, fraction → 1 = end of cycle.

export function positionFraction(position: number, length: number): number {
  return (position - 1) / length;
}

// Subdial angle (deg, clockwise from top) for a position.
export function positionAngle(position: number, length: number): number {
  return positionFraction(position, length) * 360;
}

// A subdial angle (deg from top) back to a 1..length position.
export function angleToPosition(angleDeg: number, length: number): number {
  const frac = ((angleDeg % 360) + 360) % 360 / 360;
  return wrapPosition(Math.round(frac * length) + 1, length);
}

// ----- mutators -----
export function setPosition(p: number) {
  cycle.update((c) => ({ ...c, position: wrapPosition(p, c.length) }));
}

export function nudgePosition(delta: number) {
  cycle.update((c) => ({ ...c, position: wrapPosition(c.position + delta, c.length) }));
}

export function setLength(n: number) {
  cycle.update((c) => {
    const length = clampLength(n);
    return { length, position: wrapPosition(c.position, length) };
  });
}

export function startToday() {
  cycle.update((c) => ({ ...c, position: 1 }));
}
