const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function pemBytes(pem: string) {
  const content = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(content); return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
let accessCache: { token: string; expires: number } | undefined;
export async function googleAccessToken(accountJson: string) {
  if (accessCache && accessCache.expires > Date.now() + 60_000) return accessCache.token;
  const account = JSON.parse(accountJson) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const data = `${head}.${claims}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(data)));
  const assertion = `${data}.${b64url(sig)}`;
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error('Google OAuth token request failed');
  const token = await response.json() as { access_token: string; expires_in: number };
  accessCache = { token: token.access_token, expires: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}
