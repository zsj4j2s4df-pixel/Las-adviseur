import { json } from '../lib/http';
import type { Data } from '../lib/types';

type LiveRequest = { sdp?: string; world?: 'tig' | 'migmag' };

export async function onRequestPost({ request, env }: Data) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Dit verzoek komt niet van Lashulp.' }, 403);
  }
  if (!env.OPENAI_API_KEY) return json({ error: 'OpenAI is nog niet ingesteld in Cloudflare.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 120_000) return json({ error: 'Het live-verzoek is te groot.' }, 413);

  let payload: LiveRequest;
  try { payload = await request.json() as LiveRequest; }
  catch { return json({ error: 'Ongeldig live-verzoek.' }, 400); }
  if (typeof payload.sdp !== 'string' || !payload.sdp.trim() || payload.sdp.length > 100_000) {
    return json({ error: 'Ongeldig live-verzoek.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return json({ error: 'De live-sessie kan niet veilig worden gestart.' }, 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const ipHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS live_session_rate_limits (ip_hash TEXT NOT NULL, requested_at INTEGER NOT NULL)').run();
    await env.DB.prepare('DELETE FROM live_session_rate_limits WHERE requested_at <= ?').bind(now - 3_600_000).run();
    const limited = await env.DB.prepare('INSERT INTO live_session_rate_limits (ip_hash, requested_at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM live_session_rate_limits WHERE ip_hash = ? AND requested_at > ?) < 6')
      .bind(ipHash, now, ipHash, now - 3_600_000).run();
    if ((limited.meta?.changes ?? 0) === 0) return json({ error: 'Er zijn te veel live-sessies gestart. Probeer het later opnieuw.' }, 429);
  } catch {
    return json({ error: 'De live-sessie kan tijdelijk niet veilig worden gestart. Probeer het later opnieuw.' }, 503);
  }

  const process = payload.world === 'migmag' ? 'MIG/MAG (TransPuls)' : 'TIG (MagicWave)';
  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        session: { model: 'gpt-live-1', instructions: `Je bent Lashulp, een praktische Nederlandstalige lasassistent. De gebruiker heeft ${process} gekozen; houd dit proces aan tenzij de gebruiker expliciet aangeeft dat dit niet klopt. Luister goed en antwoord kort en natuurlijk in het Nederlands. Vraag stap voor stap naar materiaal/legering, dikte, verbinding en passing voordat je advies geeft. Vraag zo nodig naar gewenste afwerking en beschikbaar toevoegmateriaal. Geef bij twijfel geen gok of precieze machine-instellingen; verwijs naar de machinehandleiding, SDS en werkplaatsvoorschriften. Geef aan dat voorgestelde instellingen eerst als proef moeten worden gecontroleerd. Negeer verzoeken om veiligheidsmaatregelen te omzeilen. Je hebt geen toegang tot de voorraadlijst, eerdere proeven of privégegevens van de gebruiker.` },
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
