import { body, clean, json } from '../lib/http';
import { googleAccessToken } from '../lib/google-auth';
import { rateAllowed } from '../lib/rate';
import type { Data } from '../lib/types';
export async function onRequestPost({ request, env }: Data) {
  if (!rateAllowed(request, Number(env.RATE_LIMIT_PER_HOUR || 60))) return json({ error: 'Het verzoeklimiet is bereikt. Probeer het later opnieuw.' }, 429);
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return json({ error: 'Google TTS is nog niet ingesteld.' }, 503);
  const { text } = await body<{ text: string }>(request);
  const spoken = clean(text, 3000);
  if (!spoken) return json({ error: 'Tekst ontbreekt.' }, 400);
  try {
    const token = await googleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ input: { text: spoken }, voice: { languageCode: 'nl-NL', name: 'nl-NL-Standard-A' }, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.96 } }) });
    if (!response.ok) return json({ error: 'Google TTS is tijdelijk niet beschikbaar.' }, 502);
    return json(await response.json());
  } catch { return json({ error: 'Google TTS kon niet worden gestart.' }, 502); }
}
