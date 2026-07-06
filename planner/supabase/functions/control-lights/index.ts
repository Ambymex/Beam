// control-lights Edge Function: Triggers Tuya Tap-to-Run scenes mapped to planner presets.
//
// Expected Env Variables:
// - TUYA_CLIENT_ID: Tuya Access ID
// - TUYA_SECRET: Tuya Access Secret
// - TUYA_HOME_ID: Tuya Home ID
// - TUYA_SCENE_SWEET, TUYA_SCENE_FOCUS, TUYA_SCENE_WIND_DOWN, etc. (Scene IDs)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TUYA_ENDPOINT = 'https://openapi.tuyacn.com'; // China Data Center

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const clientId = Deno.env.get('TUYA_CLIENT_ID');
    const secret = Deno.env.get('TUYA_SECRET');
    const homeId = Deno.env.get('TUYA_HOME_ID');

    if (!clientId || !secret || !homeId) {
      return json({ error: 'TUYA_CLIENT_ID, TUYA_SECRET, or TUYA_HOME_ID env variables not configured.' }, 500);
    }

    const { preset } = await req.json();
    if (!preset) {
      return json({ error: 'preset parameter is required.' }, 400);
    }

    // Map preset to corresponding env variable containing scene ID
    const envKey = `TUYA_SCENE_${preset.toUpperCase()}`;
    const sceneId = Deno.env.get(envKey);

    if (!sceneId) {
      console.warn(`[Tuya] Preset "${preset}" requested but no scene ID mapped under env key "${envKey}"`);
      return json({ ok: true, skipped: `No scene ID configured for preset: ${preset}` });
    }

    console.log(`[Tuya] Triggering scene "${sceneId}" for preset "${preset}"...`);

    // 1. Fetch access token
    const tokenPath = '/v1.0/token?grant_type=1';
    const tokenHeaders = await getTuyaHeaders(clientId, secret, 'GET', tokenPath, '');
    const tokenRes = await fetch(`${TUYA_ENDPOINT}${tokenPath}`, { headers: tokenHeaders });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Failed to fetch Tuya token: ${tokenRes.status} ${errText}`);
    }
    const tokenData = await tokenRes.json();
    if (!tokenData.success) {
      throw new Error(`Tuya token error: ${tokenData.msg}`);
    }
    const accessToken = tokenData.result.access_token;

    // 2. Trigger scene
    const triggerPath = `/v1.0/homes/${homeId}/scenes/${sceneId}/trigger`;
    const triggerHeaders = await getTuyaHeaders(clientId, secret, 'POST', triggerPath, '', accessToken);
    const triggerRes = await fetch(`${TUYA_ENDPOINT}${triggerPath}`, {
      method: 'POST',
      headers: triggerHeaders,
    });
    if (!triggerRes.ok) {
      const errText = await triggerRes.text();
      throw new Error(`Failed to trigger scene: ${triggerRes.status} ${errText}`);
    }
    const triggerData = await triggerRes.json();
    if (!triggerData.success) {
      throw new Error(`Tuya scene trigger error: ${triggerData.msg}`);
    }

    console.log(`[Tuya] Successfully triggered scene: ${sceneId}`);
    return json({ ok: true, sceneId });

  } catch (err) {
    console.error('[Tuya] Light control failed:', err);
    return json({ error: String(err) }, 500);
  }
});

// --- Cryptographic Signatures Helper ---

async function sha256(str: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(key);
  const messageBuf = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageBuf);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function getTuyaHeaders(
  clientId: string,
  secret: string,
  method: string,
  path: string,
  body: string,
  accessToken = ''
): Promise<HeadersInit> {
  const t = Date.now().toString();
  const nonce = '';
  const contentHash = await sha256(body);
  const stringToSign = [
    method.toUpperCase(),
    contentHash,
    '', // Headers (empty)
    path
  ].join('\n');

  const signStr = clientId + accessToken + t + nonce + stringToSign;
  const sign = await hmacSha256(secret, signStr);

  const headers: HeadersInit = {
    'client_id': clientId,
    'sign': sign,
    't': t,
    'sign_method': 'HMAC-SHA256',
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['access_token'] = accessToken;
  }

  return headers;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
