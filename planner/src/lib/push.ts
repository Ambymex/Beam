// Client-side Web Push plumbing (spec §7). Handles permission, subscription,
// and a local test that proves the receive half without a push service.
//
// iOS reality (§7): Web Push works ONLY when the PWA is installed to the Home
// Screen, and the permission prompt must fire from INSIDE the installed app.
// We surface that state so onboarding can guide Share → Add to Home Screen.
//
// The VAPID PUBLIC key is injected at build/deploy time (Supabase round). It's
// safe to ship publicly; the private key stays server-side and never reaches
// the client. Until it's set, subscribe() degrades gracefully.

import { writable } from 'svelte/store';

export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export const pushPermission = writable<PermissionState>(currentPermission());
export const pushSubscribed = writable(false);

export function currentPermission(): PermissionState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PermissionState;
}

// True when running as an installed PWA (standalone display mode). On iOS this
// is the gate for Web Push working at all (§7).
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari exposes navigator.standalone; everything else uses the media query.
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return Boolean(iosStandalone || mq);
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  const res = await Notification.requestPermission();
  const state = res as PermissionState;
  pushPermission.set(state);
  return state;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Build over a fresh ArrayBuffer so the type is the plain (non-shared) view
  // that applicationServerKey expects.
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

// Subscribe to push. Returns the PushSubscription (to POST to the server) or
// null when not possible yet (no key, no permission, no push service offline).
export async function subscribe(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined') return null;
  if (currentPermission() !== 'granted') return null;
  if (!VAPID_PUBLIC_KEY) return null; // server round wires this in
  const reg = await navigator.serviceWorker.ready;
  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    pushSubscribed.set(true);
    return sub;
  } catch {
    // No push service (e.g. offline / sandbox) — receive path still works via
    // the SW message channel; subscription just isn't available here.
    return null;
  }
}

// Fire a notification through the SW without a push service — the same render
// path a real push uses (§7). Proves the receive half end-to-end locally.
export async function sendTestNotification(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  if (currentPermission() !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const payload = {
    title: 'Time to leave',
    body: 'Doctor at 10:00 — head out now to make it.',
    tag: 'test',
    kind: 'travel-start',
    url: '/',
  };
  // Prefer the active SW message channel; fall back to a direct show.
  if (reg.active) {
    reg.active.postMessage({ type: 'mock-push', payload });
  } else {
    await reg.showNotification(payload.title, { body: payload.body, icon: '/icon.svg' });
  }
  return true;
}
