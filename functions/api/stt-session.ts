import { json } from '../lib/http';
import { rateAllowed } from '../lib/rate';
import type { Data } from '../lib/types';
const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function onRequestPost({ env, request }: Data) {
  if (!rateAllowed(request, Number(env.RATE_LIMIT_PER_HOUR || 60))) return json({ error: 'Het verzoeklimiet is bereikt. Probeer het later opnieuw.' }, 429);
  if (!env.STT_BRIDGE_URL || !env.STT_BRIDGE_HMAC) return json({ error: 'Google streaming is nog niet ingesteld.' }, 503);
  const expires = Math.floor(Date.now()/1000) + 120;
  const nonce = crypto.randomUUID();
  const payload = base64url(encoder.encode(JSON.stringify({ exp: expires, nonce })));
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.STT_BRIDGE_HMAC), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
  return json({ url: env.STT_BRIDGE_URL, token: `${payload}.${signature}` });
}
