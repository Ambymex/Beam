// Physical Haptic & Sub-Bass Audio Synthesis Engine
// Bridges the Web Vibration API (Android / supporting browsers) and
// the Web Audio API (iOS / iPhone / WebKit) to deliver tangible mechanical weight.
// On iPhone, low sub-bass acoustic waveforms (38Hz–65Hz) physically vibrate the
// bottom speaker enclosure in the palm of your hand as an acoustic haptic transducer.

import { writable } from 'svelte/store';

export type HapticStyle =
  | 'heavy_strike'
  | 'containment_lock'
  | 'engine_purr'
  | 'heartbeat'
  | 'sub_bass_thrum';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

const HAPTICS_KEY = 'radial-planner-haptics-enabled';

function getStoredHapticsPref(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const val = localStorage.getItem(HAPTICS_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

export const hapticsEnabled = writable<boolean>(getStoredHapticsPref());

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

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === 'suspended' && unlocked) {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// User-gesture unlocker so Web Audio works seamlessly after first tap/click on iOS/Safari
if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'keydown'];
  const unlock = () => {
    unlocked = true;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    unlockEvents.forEach((ev) => window.removeEventListener(ev, unlock));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
}

/**
 * Creates a soft-saturation waveshaper curve so low-frequency sub-bass tones
 * produce clean low-order harmonics that translate into physical speaker movement
 * on mobile devices without harsh digital clipping.
 */
function makeSoftDriveCurve(amount = 2): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Triggers a physical haptic pulse and synthesized sub-bass audio thrum.
 */
export function triggerHapticPulse(style: HapticStyle = 'engine_purr', intensity: HapticIntensity = 'heavy') {
  if (typeof window === 'undefined') return;

  let enabled = true;
  hapticsEnabled.subscribe((v) => (enabled = v))();
  if (!enabled) return;

  const mult = intensity === 'light' ? 0.45 : intensity === 'medium' ? 0.72 : 1.0;

  // 1. Hardware Taptic / Vibration API (Android & supporting browsers)
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      switch (style) {
        case 'heavy_strike':
          navigator.vibrate([45, 35, 140]);
          break;
        case 'containment_lock':
          navigator.vibrate([60, 40, 100, 35, 180]);
          break;
        case 'engine_purr':
          navigator.vibrate([30, 40, 30, 40, 45, 40, 30]);
          break;
        case 'heartbeat':
          navigator.vibrate([50, 75, 90]);
          break;
        case 'sub_bass_thrum':
        default:
          navigator.vibrate([120]);
          break;
      }
    } catch {
      /* ignore vibration permission/feature errors */
    }
  }

  // 2. Synthesized Sub-Bass Audio Thrum (Transducer resonance for iPhone / iOS speakers)
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);

    const waveshaper = ctx.createWaveShaper();
    waveshaper.curve = makeSoftDriveCurve(1.8) as any;
    waveshaper.oversample = '2x';

    masterGain.connect(waveshaper);
    waveshaper.connect(ctx.destination);

    if (style === 'heavy_strike') {
      // Massive tungsten drop: fast pitch bend down from 95Hz to 36Hz with heavy acoustic thump
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.32);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.55 * mult, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.4);
    } else if (style === 'containment_lock') {
      // Hydraulic blast-door slam: initial approach thrum + massive clamping lock
      // Slam 1 (approach)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(56, now);
      osc1.frequency.linearRampToValueAtTime(42, now + 0.16);

      const gain1 = ctx.createGain();
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.35 * mult, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Slam 2 (heavy lock at +0.18s)
      const lockTime = now + 0.18;
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(74, lockTime);
      osc2.frequency.exponentialRampToValueAtTime(34, lockTime + 0.4);

      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.001, lockTime);
      gain2.gain.linearRampToValueAtTime(0.6 * mult, lockTime + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, lockTime + 0.45);

      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(lockTime);
      osc2.stop(lockTime + 0.5);
    } else if (style === 'engine_purr') {
      // Deep resonant dreadnought idle: 48Hz base frequency with a warm 7Hz mechanical tremolo
      const dur = 0.95;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(48, now);
      osc.frequency.linearRampToValueAtTime(44, now + dur);

      // LFO for the steady engine rhythm
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(7.2, now);

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.18 * mult, now);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.001, now);
      oscGain.gain.linearRampToValueAtTime(0.42 * mult, now + 0.15);
      oscGain.gain.setValueAtTime(0.42 * mult, now + dur - 0.25);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      lfo.connect(lfoGain.gain);
      osc.connect(oscGain);
      oscGain.connect(masterGain);

      lfo.start(now);
      osc.start(now);
      lfo.stop(now + dur);
      osc.stop(now + dur);
    } else if (style === 'heartbeat') {
      // Heavy double-pulse: lub-dub
      // Thump 1
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(58, now);
      osc1.frequency.exponentialRampToValueAtTime(42, now + 0.13);

      const gain1 = ctx.createGain();
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.45 * mult, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Thump 2
      const dubTime = now + 0.18;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(52, dubTime);
      osc2.frequency.exponentialRampToValueAtTime(36, dubTime + 0.18);

      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.001, dubTime);
      gain2.gain.linearRampToValueAtTime(0.52 * mult, dubTime + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, dubTime + 0.2);

      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(dubTime);
      osc2.stop(dubTime + 0.22);
    } else {
      // Sub-bass thrum: deep 42Hz wave with warm lingering body
      const dur = 0.75;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(44, now);
      osc.frequency.linearRampToValueAtTime(38, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.48 * mult, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + dur);
    }
  } catch (err) {
    console.warn('[Haptics] Failed playing sub-bass thrum:', err);
  }
}
