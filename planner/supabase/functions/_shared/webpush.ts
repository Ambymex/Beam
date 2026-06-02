// Minimal Web Push (VAPID + RFC 8291 aes128gcm) for Deno / Supabase Edge
// Functions, using only Web Crypto — no npm deps. Sends an encrypted payload to
// a single PushSubscription. (§7)
//
// Keys: VAPID public/private are base64url. The private key is the raw P-256
// scalar `d` (32 bytes) as produced by `npx web-push generate-vapid-keys`.

const enc = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}
export function bytesToB64url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

export interface VapidKeys {
  publicKey: string; // base64url, 65-byte uncompressed point
  privateKey: string; // base64url, 32-byte scalar
  subject: string; // 'mailto:you@example.com'
}
export interface PushSub {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

// Build the P-256 CryptoKey pair from the VAPID base64url material.
async function importVapidKey(pub: string, priv: string): Promise<CryptoKey> {
  const pubBytes = b64urlToBytes(pub); // 65 bytes: 0x04 || X(32) || Y(32)
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const d = priv;
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

// VAPID JWT (ES256) for the Authorization header.
async function vapidAuth(endpoint: string, keys: VapidKeys): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const signingInput = `${header}.${body}`;
  const key = await importVapidKey(keys.publicKey, keys.privateKey);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)),
  );
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

// HKDF helper.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

// Encrypt `payload` for the subscription using aes128gcm (RFC 8291) and POST it.
export async function sendWebPush(
  sub: PushSub,
  payload: string,
  keys: VapidKeys,
): Promise<Response> {
  const asPublic = b64urlToBytes(sub.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(sub.auth); // 16 bytes

  // ephemeral server ECDH key pair
  const localPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localPair.publicKey)); // 65

  const uaPub = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPub },
    localPair.privateKey,
    256,
  );
  const ecdh = new Uint8Array(sharedBits);

  // PRK_key = HKDF(auth, ecdh, "WebPush: info" || ua_pub || server_pub, 32)
  const keyInfo = concat(
    enc.encode('WebPush: info\0'),
    asPublic,
    localPubRaw,
  );
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // body = payload || 0x02 (last record padding delimiter)
  const plain = concat(enc.encode(payload), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain),
  );

  // aes128gcm header: salt(16) || rs(4, =4096) || idlen(1) || keyid(server pub)
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const header = concat(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw);
  const cipher = concat(header, ct);

  const auth = await vapidAuth(sub.endpoint, keys);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body: cipher,
  });
}
