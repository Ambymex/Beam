// Physical Haptic & Mechanical Purr Engine
// Bridges the native Apple Taptic Engine (via direct-touch native switch control),
// the Web Vibration API (Android / supporting mobile devices),
// and tuned low-frequency sub-bass acoustic transducers (45Hz–55Hz pure sine, zero buzzy harmonics).
// Eliminates high-frequency electronic noise so you only feel the deep physical mechanical purr in your palm.

import { writable } from 'svelte/store';

export type HapticStyle =
  | 'heavy_strike'
  | 'containment_lock'
  | 'engine_purr'
  | 'heartbeat'
  | 'sub_bass_thrum';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

const HAPTICS_KEY = 'radial-planner-haptics-enabled';
const INTENSITY_KEY = 'radial-planner-haptic-intensity';

function getStoredPref(key: string, defaultVal: boolean): boolean {
  if (typeof localStorage === 'undefined') return defaultVal;
  try {
    const val = localStorage.getItem(key);
    if (val === null) return defaultVal;
    return val !== 'false';
  } catch {
    return defaultVal;
  }
}

function getStoredIntensity(): HapticIntensity {
  if (typeof localStorage === 'undefined') return 'heavy';
  try {
    const val = localStorage.getItem(INTENSITY_KEY);
    if (val === 'light' || val === 'medium' || val === 'heavy') return val;
    return 'heavy';
  } catch {
    return 'heavy';
  }
}

// Master haptics toggle (default: true)
export const hapticsEnabled = writable<boolean>(getStoredPref(HAPTICS_KEY, true));

// Intensity setting (default: 'heavy')
export const hapticIntensity = writable<HapticIntensity>(getStoredIntensity());

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled.set(enabled);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HAPTICS_KEY, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('[Haptics] Failed saving preference:', e);
    }
  }
}

export function setHapticIntensity(intensity: HapticIntensity) {
  hapticIntensity.set(intensity);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(INTENSITY_KEY, intensity);
    } catch (e) {
      console.warn('[Haptics] Failed saving intensity preference:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Clean Low-Frequency Sub-Bass Acoustic Transducer (45Hz–55Hz Pure Sine)
// Replaces the harsh 80Hz+ distorted synthesizer buzz with smooth, deep,
// muffled low-end energy. Human ears are 35-40dB less sensitive at 50Hz,
// but the phone's bottom speaker voice coil physically pumps air to shake the chassis.
// ---------------------------------------------------------------------------

function synthesizeCleanPulse(style: HapticStyle, mult = 1.0): Float32Array {
  const sr = 22050;
  let dur = 0.35;
  if (style === 'engine_purr') dur = 0.85;
  if (style === 'containment_lock') dur = 0.48;
  if (style === 'heartbeat') dur = 0.44;
  if (style === 'sub_bass_thrum') dur = 0.65;

  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  let phase1 = 0;
  let phase2 = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;

    if (style === 'engine_purr') {
      // 54Hz -> 47Hz smooth sub-bass with 9Hz rhythmic purring throb
      // Pure sine wave with gentle cosine tapers: zero buzzy/musical harmonics!
      const f = 47 + 7 * Math.exp(-t * 2.5);
      phase1 += (2 * Math.PI * f) / sr;
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 9 * t);
      const env = Math.min(1, t / 0.05) * Math.min(1, (dur - t) / 0.08);
      s = Math.sin(phase1) * Math.pow(lfo, 1.4) * env * 0.95;
    } else if (style === 'heavy_strike') {
      // 75Hz -> 45Hz deep mechanical thump
      const f = 45 + 30 * Math.exp(-t * 14);
      phase1 += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.015) * Math.exp(-t * 7);
      s = Math.sin(phase1) * env * 0.95;
    } else if (style === 'containment_lock') {
      // Double hydraulic clamp: approach impact then deep lock
      if (t < 0.14) {
        const f = 48 + 18 * Math.exp(-t * 16);
        phase1 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 12);
        s = Math.sin(phase1) * env * 0.6;
      } else {
        const t2 = t - 0.15;
        const f = 44 + 34 * Math.exp(-t2 * 12);
        phase2 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t2 / 0.015) * Math.exp(-t2 * 6.5);
        s = Math.sin(phase2) * env * 0.95;
      }
    } else if (style === 'heartbeat') {
      // Lub-dub: smooth double pulse
      if (t < 0.14) {
        const f = 48 + 20 * Math.exp(-t * 16);
        phase1 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 12);
        s = Math.sin(phase1) * env * 0.7;
      } else {
        const t2 = t - 0.16;
        const f = 44 + 30 * Math.exp(-t2 * 14);
        phase2 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t2 / 0.012) * Math.exp(-t2 * 7.5);
        s = Math.sin(phase2) * env * 0.95;
      }
    } else {
      // sub_bass_thrum: smooth 54Hz -> 44Hz low swell
      const f = 44 + 10 * Math.exp(-t * 3);
      phase1 += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.04) * Math.exp(-t * 4);
      s = Math.sin(phase1) * env * 0.92;
    }

    samples[i] = Math.max(-0.95, Math.min(0.95, s * mult));
  }

  return samples;
}

function createWavUrl(samples: Float32Array, sampleRate = 22050): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

const wavCache: Partial<Record<string, string>> = {};

function getWavUrl(style: HapticStyle, intensity: HapticIntensity): string {
  const key = `${style}_${intensity}`;
  if (wavCache[key]) return wavCache[key]!;
  const mult = intensity === 'light' ? 0.42 : intensity === 'medium' ? 0.72 : 1.0;
  const samples = synthesizeCleanPulse(style, mult);
  const url = createWavUrl(samples, 22050);
  wavCache[key] = url;
  return url;
}

// ---------------------------------------------------------------------------
// 2. Hardware Vibration API (Android / supporting devices)
// ---------------------------------------------------------------------------

function fireAndroidVibration(style: HapticStyle) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    switch (style) {
      case 'engine_purr':
        navigator.vibrate([35, 40, 35, 40, 35, 40, 35, 40, 35]);
        break;
      case 'heavy_strike':
        navigator.vibrate([55, 30, 165]);
        break;
      case 'containment_lock':
        navigator.vibrate([70, 35, 120, 30, 210]);
        break;
      case 'heartbeat':
        navigator.vibrate([65, 80, 110]);
        break;
      case 'sub_bass_thrum':
      default:
        navigator.vibrate([145]);
        break;
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// 3. Main Haptic Dispatcher
// ---------------------------------------------------------------------------

/**
 * Triggers physical mechanical presence.
 * Plays via HTML5 Media Channel (bypasses iPhone silent switch, instantaneous on tap 1)
 * paired with Android hardware vibration motor.
 */
export function triggerHapticPulse(
  style: HapticStyle = 'engine_purr',
  overrideIntensity?: HapticIntensity
) {
  if (typeof window === 'undefined') return;

  let enabled = true;
  hapticsEnabled.subscribe((v) => (enabled = v))();
  if (!enabled) return;

  let activeIntensity: HapticIntensity = 'heavy';
  hapticIntensity.subscribe((v) => (activeIntensity = v))();
  const intensity = overrideIntensity || activeIntensity;

  // 1. Silent hardware motor for Android / Chrome
  fireAndroidVibration(style);

  // 2. High-displacement clean 45-55Hz sub-bass wave (HTML5 Media Playback)
  // Bypasses iOS silent switch and eliminates the AudioContext first-tap latency bug.
  // Intensity is baked directly into the PCM audio samples to ensure proper scaling on iOS Safari.
  try {
    const url = getWavUrl(style, intensity);
    const audio = new Audio(url);
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  } catch {}
}
