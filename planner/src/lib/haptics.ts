// Physical Haptic & Sub-Bass Audio Synthesis Engine
// Bridges the Web Vibration API (Android / supporting browsers) and
// the Web Audio API + HTML5 Audio Media Channel (iOS / iPhone / WebKit) to deliver tangible mechanical weight.
// On iPhone, iOS routes standard Web Audio to the ambient channel (muted by the physical silent switch).
// By synthesizing tuned resonant PCM WAVs (80Hz–145Hz) played via HTML5 media playback and concurrent Web Audio,
// the acoustic transducer physically rattles the bottom speaker enclosure in the palm of your hand even in silent mode.

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
let audioUnlocked = false;

// Tiny 1-sample silent WAV data URI to unlock the iOS audio session
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === 'suspended' && audioUnlocked) {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Unlocks iOS Safari audio session into the "playback" category (bypassing the mute switch)
 * and resumes any suspended AudioContext. Safe to call multiple times.
 */
export function unlockAudioSession() {
  if (typeof window === 'undefined') return;
  audioUnlocked = true;

  try {
    const a = new Audio(SILENT_WAV);
    a.play().catch(() => {});
  } catch {}

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// User-gesture unlocker: unlocks audio on first tap/touch anywhere in the application
if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const onGesture = () => {
    unlockAudioSession();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, onGesture));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, onGesture, { passive: true }));
}

/**
 * Synthesizes high-energy, resonant low-frequency acoustic waveforms
 * tailored specifically for the miniature transducer enclosure in mobile phones (80Hz–145Hz).
 * Includes harmonic saturation so the speaker cone physically displaces and vibrates the device chassis.
 */
function synthesizePulse(style: HapticStyle): Float32Array {
  const sr = 22050;
  let dur = 0.38;
  if (style === 'engine_purr') dur = 0.95;
  if (style === 'containment_lock') dur = 0.52;
  if (style === 'heartbeat') dur = 0.44;
  if (style === 'sub_bass_thrum') dur = 0.65;

  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  let phase1 = 0;
  let phase2 = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;

    if (style === 'heavy_strike') {
      // Massive tungsten drop: rapid downward frequency sweep 140Hz -> 55Hz
      // Delivers a sharp mechanical "thunk" with lingering saturated low body
      const f = 55 + 85 * Math.exp(-t * 14);
      phase1 += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 6.5);
      const raw = Math.sin(phase1) + 0.35 * Math.sin(phase1 * 2);
      s = Math.tanh(raw * 1.7) * env * 0.95;
    } else if (style === 'containment_lock') {
      // Hydraulic blast-door slam: approach impact followed by heavy mechanical clamping latch
      if (t < 0.15) {
        const f = 60 + 40 * Math.exp(-t * 16);
        phase1 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 10);
        s = Math.tanh(Math.sin(phase1) * 1.4) * env * 0.65;
      } else {
        const t2 = t - 0.16;
        const f = 52 + 98 * Math.exp(-t2 * 12);
        phase2 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t2 / 0.015) * Math.exp(-t2 * 6);
        const raw = Math.sin(phase2) + 0.4 * Math.sin(phase2 * 2);
        s = Math.tanh(raw * 1.8) * env * 0.95;
      }
    } else if (style === 'engine_purr') {
      // Resonant dreadnought idle: 80Hz base frequency with an 8.5Hz mechanical tremolo modulation
      // Saturated odd harmonics (3rd) physically rattle the speaker diaphragm against the hand
      const f = 78 + 4 * Math.sin(2 * Math.PI * 4 * t);
      phase1 += (2 * Math.PI * f) / sr;
      const lfo = 0.65 + 0.35 * Math.sin(2 * Math.PI * 8.5 * t);
      const env = Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.12);
      const raw = Math.sin(phase1) + 0.38 * Math.sin(phase1 * 3);
      s = Math.tanh(raw * 1.5) * lfo * env * 0.92;
    } else if (style === 'heartbeat') {
      // Anatomical double-thump (lub-dub)
      if (t < 0.16) {
        const f = 65 + 50 * Math.exp(-t * 18);
        phase1 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 12);
        s = Math.tanh(Math.sin(phase1) * 1.4) * env * 0.8;
      } else {
        const t2 = t - 0.18;
        const f = 56 + 74 * Math.exp(-t2 * 14);
        phase2 += (2 * Math.PI * f) / sr;
        const env = Math.min(1, t2 / 0.012) * Math.exp(-t2 * 8);
        const raw = Math.sin(phase2) + 0.35 * Math.sin(phase2 * 2);
        s = Math.tanh(raw * 1.6) * env * 0.95;
      }
    } else {
      // sub_bass_thrum: deep 88Hz -> 58Hz warm lingering swell
      const f = 58 + 30 * Math.exp(-t * 4);
      phase1 += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.04) * Math.exp(-t * 3.8);
      const raw = Math.sin(phase1) + 0.28 * Math.sin(phase1 * 2);
      s = Math.tanh(raw * 1.4) * env * 0.92;
    }

    samples[i] = Math.max(-0.95, Math.min(0.95, s));
  }

  return samples;
}

/**
 * Packs a Float32Array into a standard 16-bit Mono PCM WAV blob URL.
 */
function createWavUrl(samples: Float32Array, sampleRate = 22050): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, samples.length * 2, true); // Subchunk2Size

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// In-memory cache of synthesized WAV blob URLs
const wavCache: Partial<Record<HapticStyle, string>> = {};

function getWavUrl(style: HapticStyle): string {
  if (wavCache[style]) return wavCache[style]!;
  const samples = synthesizePulse(style);
  const url = createWavUrl(samples, 22050);
  wavCache[style] = url;
  return url;
}

/**
 * Triggers a physical haptic pulse and synthesized sub-bass audio thrum.
 * 1. Fires hardware vibration motor via navigator.vibrate (Android / Chrome / Edge).
 * 2. Plays synthesized sub-bass acoustic WAV via HTML5 Audio (bypasses iPhone physical Silent switch).
 * 3. Plays concurrent Web Audio API synthesizer for full fidelity when available.
 */
export function triggerHapticPulse(
  style: HapticStyle = 'engine_purr',
  intensity: HapticIntensity = 'heavy'
) {
  if (typeof window === 'undefined') return;

  let enabled = true;
  hapticsEnabled.subscribe((v) => (enabled = v))();
  if (!enabled) return;

  // Ensure audio session is unlocked if this call was triggered directly by a user tap
  unlockAudioSession();

  const mult = intensity === 'light' ? 0.55 : intensity === 'medium' ? 0.8 : 1.0;

  // 1. Hardware Taptic / Vibration API (Android & supporting browsers)
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      switch (style) {
        case 'heavy_strike':
          navigator.vibrate([55, 30, 165]);
          break;
        case 'containment_lock':
          navigator.vibrate([70, 35, 120, 30, 210]);
          break;
        case 'engine_purr':
          navigator.vibrate([40, 35, 40, 35, 50, 35, 40]);
          break;
        case 'heartbeat':
          navigator.vibrate([65, 80, 110]);
          break;
        case 'sub_bass_thrum':
        default:
          navigator.vibrate([145]);
          break;
      }
    } catch {
      /* ignore vibration permission/feature errors */
    }
  }

  // 2. HTML5 Media Playback Channel (CRITICAL FOR IPHONE):
  // HTML5 <audio> elements route to the iOS "Media Playback" category,
  // allowing the acoustic transducer pulse to physically play through the speakers
  // EVEN WHEN THE IPHONE PHYSICAL SILENT / MUTE SWITCH IS TURNED ON!
  try {
    const url = getWavUrl(style);
    const audio = new Audio(url);
    audio.volume = Math.min(1.0, mult);
    audio.play().catch((err) => {
      console.warn('[Haptics] HTML5 audio playback prevented:', err);
    });
  } catch (err) {
    console.warn('[Haptics] Failed playing HTML5 audio pulse:', err);
  }

  // 3. Web Audio API concurrent synthesizer (with fixed 1.0 master volume)
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'closed') {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      playWebAudioSynth(ctx, style, mult);
    }
  } catch (err) {
    console.warn('[Haptics] Web Audio error:', err);
  }
}

/**
 * Web Audio API synthesizer node graph (with corrected 1.0 masterGain volume).
 */
function playWebAudioSynth(ctx: AudioContext, style: HapticStyle, mult: number) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  // FIXED: masterGain was previously stuck at 0.001 (-60dB mute)
  masterGain.gain.setValueAtTime(mult, now);
  masterGain.connect(ctx.destination);

  if (style === 'heavy_strike') {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.32);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.85, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  } else if (style === 'containment_lock') {
    // Slam 1 (approach)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(85, now);
    osc1.frequency.linearRampToValueAtTime(58, now + 0.14);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.55, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Slam 2 (heavy lock latch at +0.16s)
    const lockTime = now + 0.16;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(145, lockTime);
    osc2.frequency.exponentialRampToValueAtTime(52, lockTime + 0.35);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, lockTime);
    gain2.gain.linearRampToValueAtTime(0.88, lockTime + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, lockTime + 0.4);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(lockTime);
    osc2.stop(lockTime + 0.45);
  } else if (style === 'engine_purr') {
    const dur = 0.95;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(8.5, now);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.35, now);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(0.8, now + 0.08);
    oscGain.gain.setValueAtTime(0.8, now + dur - 0.12);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    lfo.connect(lfoGain.gain);
    osc.connect(oscGain);
    oscGain.connect(masterGain);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + dur);
    osc.stop(now + dur);
  } else if (style === 'heartbeat') {
    // Thump 1
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(110, now);
    osc1.frequency.exponentialRampToValueAtTime(65, now + 0.14);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.75, now + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Thump 2
    const dubTime = now + 0.18;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(125, dubTime);
    osc2.frequency.exponentialRampToValueAtTime(55, dubTime + 0.2);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, dubTime);
    gain2.gain.linearRampToValueAtTime(0.85, dubTime + 0.012);
    gain2.gain.exponentialRampToValueAtTime(0.001, dubTime + 0.22);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(dubTime);
    osc2.stop(dubTime + 0.24);
  } else {
    // sub_bass_thrum
    const dur = 0.65;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(88, now);
    osc.frequency.linearRampToValueAtTime(58, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.82, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }
}
