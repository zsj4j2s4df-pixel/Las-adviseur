import { body, clean, json, knowledge } from '../lib/http';
import { rateAllowed } from '../lib/rate';
import type { Data } from '../lib/types';
type Message = { role: 'user'|'assistant'; content: string };
type ChatRequest = { world: 'tig'|'migmag'; messages: Message[]; image?: { data: string; mime: string } };
const baseRules = `Je bent Lashulp, een praktische Nederlandse lasadviseur voor één gedeelde metaalwerkplaats. Stel eerst alleen relevante vragen over materiaal/legering, dikte, verbinding, passing, gewenst resultaat, nabewerking en beschikbaar toevoegmateriaal. Adviseer uitsluitend materiaal en toevoeg uit de meegeleverde actuele voorraad. Als een technisch betere diameter ontbreekt, zeg dat aanschaffen beter is; verzin nooit voorraad of machine-instellingen. Geef na voldoende informatie één startinstelling, kort waarom, gevolgd door: “Maak eerst deze proef. Verander verder niets.” Na een proef vraag je naar bovenkant, penetratie, breedte, smeltbad en toevoeg; pas daarna gericht één variabele tegelijk aan. Praktijk boven theorie. TIG en MIG/MAG kennis mogen nooit worden vermengd. Bij MIG/MAG stel eerst vast of Standard Synergic of Pulse Synergic actief is voordat je correcties uitlegt. Bij de MagicWave onderscheid je directe parameters van Setup/Setup level 2. Bij een voetpedaal onderscheid je ingestelde maximale stroom van werkelijke stroom. Bij onzekerheid, getallen of ampères vraag je om bevestiging. Beantwoord vrije vragen kort en praktisch. Bij twijfel of risico verwijs naar machinehandleiding, SDS of werkplaatsvoorschriften. Nooit PBM, ventilatie of SDS omzeilen. Bij SCL-255 noem handschoenen, oogbescherming en ventilatie; meng SCL-255 en SCL-500 nooit. Sla geen persoonsgegevens op. Foto's zijn uitsluitend voor deze analyse en mogen niet worden bewaard. Output uitsluitend JSON met velden answer (volledig tekstantwoord) en spoken (korte kern om voor te lezen, liefst maximaal 45 woorden).`;
function trimWords(text: string, limit: number) { return text.trim().split(/\s+/).slice(0, limit).join(' '); }
export async function onRequestPost({ request, env }: Data) {
  const limit = Number(env.RATE_LIMIT_PER_HOUR || 60);
  if (!rateAllowed(request, limit)) return json({ error: 'Het verzoeklimiet is bereikt. Probeer het later opnieuw.' }, 429);
  if (!env.OPENAI_API_KEY) return json({ error: 'OpenAI is nog niet ingesteld.' }, 503);
  let payload: ChatRequest;
  try { payload = await body<ChatRequest>(request); } catch { return json({ error: 'Ongeldig verzoek.' }, 400); }
  if (!['tig','migmag'].includes(payload.world) || !Array.isArray(payload.messages)) return json({ error: 'Ongeldige laswereld of berichten.' }, 400);
  const messages = payload.messages.slice(-12).map((m) => ({ role: m.role, content: clean(m.content, 6000) })).filter((m) => m.content);
  if (!messages.length) return json({ error: 'Stel eerst een vraag.' }, 400);
  let imageData: string | undefined;
  if (payload.image) {
    if (!['image/jpeg','image/png','image/webp'].includes(payload.image.mime) || payload.image.data.length > 7_000_000) return json({ error: 'Gebruik een JPG-, PNG- of WebP-foto kleiner dan 5 MB.' }, 400);
    imageData = `data:${payload.image.mime};base64,${payload.image.data}`;
  }
  const world = payload.world;
  const [notes, stock, trials] = await Promise.all([
    knowledge(env, world),
    env.DB.prepare("SELECT category,name,spec,notes,available FROM inventory WHERE world IN (?, 'shared') ORDER BY world,category,name").bind(world).all(),
    env.DB.prepare('SELECT material,thickness,joint,fitup,result,settings,created_at FROM trials WHERE world=? ORDER BY created_at DESC LIMIT 40').bind(world).all(),
  ]);
  const inventoryText = (stock.results || []).map((i: Record<string, unknown>) => `- ${i.category}: ${i.name} ${i.spec || ''} (${i.available ? 'beschikbaar' : 'niet beschikbaar'}). ${i.notes || ''}`).join('\n') || 'Er is nog geen actuele voorraad ingevuld; vraag de gebruiker eerst wat beschikbaar is.';
  const trialText = (trials.results || []).map((t: Record<string, unknown>) => `- ${t.material}, ${t.thickness}, ${t.joint}; passing: ${t.fitup}; resultaat: ${t.result}; instellingen: ${t.settings}`).join('\n') || 'Geen eigen proefreferenties opgeslagen.';
  const instructions = `${baseRules}\n\nActieve wereld: ${world === 'tig' ? 'TIG, Fronius MagicWave 3000 AC/DC' : 'MIG/MAG, Fronius TransPuls Synergic 4000 met VR 4000'}. Gebruik alleen onderstaande kennis van deze wereld en gedeelde werkplaatskennis.\n\nKENNIS:\n${notes}\n\nACTUELE VOORRAAD (leidend):\n${inventoryText}\n\nEIGEN GESLAAGDE PROEVEN (referentie, geen garantie):\n${trialText}`;
  const input: Array<Record<string, unknown>> = messages.map((m, idx) => {
    if (imageData && idx === messages.length - 1 && m.role === 'user') return { role: 'user', content: [{ type: 'input_text', text: m.content }, { type: 'input_image', image_url: imageData }] };
    return { role: m.role, content: m.content };
  });
  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', instructions: `${instructions}\n\nVraag niet naar persoonsgegevens en herhaal ze niet.`, input, max_output_tokens: 700, store: false }),
  });
  if (!result.ok) return json({ error: 'De adviesdienst is tijdelijk niet beschikbaar.' }, 502);
  const data = await result.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const raw = data.output_text || '';
  let answer = raw, spoken = '';
  try { const parsed = JSON.parse(raw) as { answer?: string; spoken?: string }; answer = parsed.answer || raw; spoken = parsed.spoken || ''; } catch { /* use plain model text as a safe fallback */ }
  const maxWords = Math.max(40, Math.min(400, Number(env.MAX_AI_WORDS || 200)));
  answer = trimWords(answer, maxWords);
  spoken = trimWords(spoken || answer, Math.min(55, Math.floor(maxWords / 2)));
  const day = new Date().toISOString().slice(0, 10);
  const inputTokens = data.usage?.input_tokens || 0, outputTokens = data.usage?.output_tokens || 0;
  const cost = inputTokens * Number(env.MODEL_INPUT_USD_PER_MILLION || 0) / 1_000_000 + outputTokens * Number(env.MODEL_OUTPUT_USD_PER_MILLION || 0) / 1_000_000;
  await env.DB.prepare(`INSERT INTO daily_usage(day,requests,input_tokens,output_tokens,estimated_usd) VALUES(?,1,?,?,?) ON CONFLICT(day) DO UPDATE SET requests=requests+1,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens,estimated_usd=estimated_usd+excluded.estimated_usd`).bind(day, inputTokens, outputTokens, cost).run();
  const total = await env.DB.prepare('SELECT estimated_usd FROM daily_usage WHERE day=?').bind(day).first<{ estimated_usd: number }>();
  const warningAt = Number(env.DAILY_WARNING_USD || 0);
  return json({ answer, spoken, budgetWarning: warningAt > 0 && (total?.estimated_usd || 0) >= warningAt, estimatedDailyUsd: total?.estimated_usd || 0 });
}
