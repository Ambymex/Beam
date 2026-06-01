// Pure notification-shaping (spec §7), shared by the service worker and tests.
// Transitions only: a block starting, an appliance cycle ENDING ("dryer's
// free"), and the load-bearing travel-START ("time to leave"). Never a nag for
// an undone task — that migrates silently (§5/§13), so there's intentionally no
// 'undone' kind here at all.

export type TransitionKind = 'block-start' | 'appliance-free' | 'travel-start' | 'generic';

export interface PushPayload {
  kind?: TransitionKind;
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

export interface NotificationSpec {
  title: string;
  options: {
    body: string;
    tag?: string;
    renotify: boolean;
    icon: string;
    badge: string;
    data: { url: string; kind: string };
    requireInteraction: boolean;
  };
}

// Build the exact notification a payload should render. Deterministic and
// side-effect-free so it can be asserted without a browser.
export function shapeNotification(payload: PushPayload | null | undefined): NotificationSpec {
  const data = payload ?? {};
  return {
    title: data.title || 'Day Ring',
    options: {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/', kind: data.kind || 'generic' },
      requireInteraction: false,
    },
  };
}
