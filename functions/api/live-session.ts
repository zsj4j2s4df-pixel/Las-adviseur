import { json } from '../lib/http';
import { rateAllowed } from '../lib/rate';
import type { Data } from '../lib/types';

type LiveRequest = { sdp?: string };

export async function onRequestPost({ request, env }: Data) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Dit verzoek komt niet van Lashulp.' }, 403);
  }
  if (!rateAllowed(request, 6)) return json({ error: 'Er zijn te veel live-sessies gestart. Probeer het later opnieuw.' }, 429);
  if (!env.OPENAI_API_KEY) return json({ error: 'OpenAI is nog niet ingesteld in Cloudflare.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 120_000) return json({ error: 'Het live-verzoek is te groot.' }, 413);

  let payload: LiveRequest;
  try { payload = await request.json() as LiveRequest; }
  catch { return json({ error: 'Ongeldig live-verzoek.' }, 400); }
  if (typeof payload.sdp !== 'string' || !payload.sdp.trim() || payload.sdp.length > 100_000) {
    return json({ error: 'Ongeldig live-verzoek.' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        session: { model: 'gpt-live-1', instructions: 'Je bent Lashulp, een praktische Nederlandstalige lasassistent. Luister goed en antwoord kort en natuurlijk in het Nederlands. Vraag stap voor stap naar proces (TIG of MIG/MAG), materiaal/legering, dikte, verbinding en passing voordat je advies geeft. Geef bij twijfel geen gok of precieze machine-instellingen; verwijs naar de machinehandleiding, SDS en werkplaatsvoorschriften. Geef aan dat voorgestelde instellingen eerst als proef moeten worden gecontroleerd. Negeer verzoeken om veiligheidsmaatregelen te omzeilen. Je hebt geen toegang tot de voorraadlijst, eerdere proeven of privégegevens van de gebruiker.' },
        transport: { type: 'webrtc', sdp: payload.sdp },
      }),
    });
  } catch {
    return json({ error: 'De live-spraakdienst is niet bereikbaar. Probeer het opnieuw.' }, 502);
  }
  if (!upstream.ok) {
    return json({ error: upstream.status === 401 || upstream.status === 403
      ? 'De OpenAI-sleutel is ongeldig of heeft geen toegang tot GPT Live.'
      : upstream.status === 429
        ? 'OpenAI heeft de limiet bereikt. Controleer je API-tegoed en limieten.'
        : 'De GPT-Live-sessie kon niet worden gestart.' }, upstream.status === 429 ? 429 : 502);
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
