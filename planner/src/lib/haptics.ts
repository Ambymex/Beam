// Physical Haptic & Sub-Bass Engine
// Bridges the native iOS Taptic Engine (via native WebKit switch control for 100% silent physical purrs),
// the Web Vibration API (Android / supporting mobile devices),
// and an optional audible sub-bass speaker synthesizer (disabled by default so you get pure silent purr without noise).

import { writable } from 'svelte/store';

export type HapticStyle =
  | 'heavy_strike'
  | 'containment_lock'
  | 'engine_purr'
  | 'heartbeat'
  | 'sub_bass_thrum';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

const HAPTICS_KEY = 'radial-planner-haptics-enabled';
const HAPTICS_AUDIO_KEY = 'radial-planner-haptics-audio';

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

// Master haptics toggle (default: true)
export const hapticsEnabled = writable<boolean>(getStoredPref(HAPTICS_KEY, true));

// Audible speaker sound toggle (default: false — 100% silent physical purr by default!)
export const hapticsAudioEnabled = writable<boolean>(getStoredPref(HAPTICS_AUDIO_KEY, false));

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

export function setHapticsAudioEnabled(enabled: boolean) {
  hapticsAudioEnabled.set(enabled);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HAPTICS_AUDIO_KEY, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('[Haptics] Failed saving audio preference:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Silent Native iOS Taptic Engine Bridge (<input type="checkbox" switch>)
// WebKit on iOS 17.4+ fires the iPhone's physical Taptic Engine vibration motor
// when a native HTML switch control is toggled. By calling .click() on an invisible
// switch element, we trigger the real, silent hardware vibration without any speaker sound!
// ---------------------------------------------------------------------------

let tapticSwitch: HTMLInputElement | null = null;
let tapticLabel: HTMLLabelElement | null = null;

function ensureTapticBridge(): { sw: HTMLInputElement; label: HTMLLabelElement } | null {
  if (typeof document === 'undefined') return null;
  if (tapticSwitch && document.body.contains(tapticSwitch)) {
    return { sw: tapticSwitch, label: tapticLabel! };
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.setAttribute('aria-hidden', 'true');

  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', ''); // WebKit native switch attribute that engages Taptic Engine
  sw.id = '__solenoid_taptic_bridge';

  const label = document.createElement('label');
  label.htmlFor = '__solenoid_taptic_bridge';

  container.appendChild(sw);
  container.appendChild(label);
  document.body.appendChild(container);

  tapticSwitch = sw;
  tapticLabel = label;
  return { sw, label };
}

function fireSilentTapticTick() {
  const bridge = ensureTapticBridge();
  if (!bridge) return;
  try {
    bridge.sw.click();
  } catch {
    try {
      bridge.label.click();
    } catch {}
  }
}

/**
 * Fires silent hardware Taptic Engine vibration patterns on iPhone (iOS 17.4+).
 * Produces real mechanical feel with zero speaker sound.
 */
function fireTapticPattern(style: HapticStyle) {
  switch (style) {
    case 'engine_purr': {
      // Dreadnought purr: rapid sequence of 6 rhythmic Taptic ticks spaced 65ms apart
      for (let i = 0; i < 6; i++) {
        setTimeout(fireSilentTapticTick, i * 65);
      }
      break;
    }
    case 'heavy_strike': {
      // Massive tungsten impact: heavy multi-tap shockwave
      fireSilentTapticTick();
      setTimeout(fireSilentTapticTick, 40);
      setTimeout(fireSilentTapticTick, 85);
      break;
    }
    case 'containment_lock': {
      // Blast doors: door contact at 0ms, then heavy dual-clamp lock at 160ms and 215ms
      fireSilentTapticTick();
      setTimeout(fireSilentTapticTick, 160);
      setTimeout(fireSilentTapticTick, 215);
      break;
    }
    case 'heartbeat': {
      // Lub-dub double pulse
      fireSilentTapticTick();
      setTimeout(fireSilentTapticTick, 175);
      setTimeout(fireSilentTapticTick, 220);
      break;
    }
    case 'sub_bass_thrum':
    default: {
      fireSilentTapticTick();
      setTimeout(fireSilentTapticTick, 65);
      setTimeout(fireSilentTapticTick, 130);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Hardware Vibration API (Android / Chrome / Edge)
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
// 3. Optional Audible Sub-Bass Synthesizer (Disabled by default!)
// Only active when the user explicitly enables "Play Audible Sub-Bass Sound on Speaker".
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended' && audioUnlocked) {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

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

if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const onGesture = () => {
    unlockAudioSession();
    ensureTapticBridge();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, onGesture));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, onGesture, { passive: true }));
}

function playOptionalSpeakerAudio(style: HapticStyle, mult: number) {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.45 * mult, now);
    masterGain.connect(ctx.destination);

    // Deep smooth sine-wave without buzzy high-order harmonics
    const osc = ctx.createOscillator();
    osc.type = 'sine';

    if (style === 'engine_purr') {
      osc.frequency.setValueAtTime(54, now);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(8, now);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.3, now);
      lfo.connect(lfoGain.gain);
      lfo.start(now);
      lfo.stop(now + 0.85);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.08);
      gain.gain.setValueAtTime(0.4, now + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.85);
    } else {
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Main Public Export
// ---------------------------------------------------------------------------

/**
 * Triggers a physical haptic pulse.
 * - Defaults to 100% SILENT physical vibration via the iPhone Taptic Engine and Android motor.
 * - ZERO speaker noise unless "Play Audible Sub-Bass Sound on Speaker" is explicitly toggled on in Settings.
 */
export function triggerHapticPulse(
  style: HapticStyle = 'engine_purr',
  intensity: HapticIntensity = 'heavy'
) {
  if (typeof window === 'undefined') return;

  let enabled = true;
  hapticsEnabled.subscribe((v) => (enabled = v))();
  if (!enabled) return;

  // 1. Silent native Taptic Engine bridge for iPhone (iOS 17.4+)
  fireTapticPattern(style);

  // 2. Silent hardware vibration motor for Android & Chrome
  fireAndroidVibration(style);

  // 3. Only play speaker audio if explicitly enabled by user (default is FALSE / SILENT)
  let audioOn = false;
  hapticsAudioEnabled.subscribe((v) => (audioOn = v))();
  if (audioOn) {
    const mult = intensity === 'light' ? 0.5 : intensity === 'medium' ? 0.75 : 1.0;
    playOptionalSpeakerAudio(style, mult);
  }
}
