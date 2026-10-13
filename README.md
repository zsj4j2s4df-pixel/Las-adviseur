# Lashulp

Handen-vrije, Nederlandstalige lashulp voor de Fronius MagicWave 3000 AC/DC (TIG) en TransPuls Synergic 4000 met VR 4000 (MIG/MAG). De kennis, voorraad en proefreferenties zijn per proces gescheiden. De gedeelde beheeromgeving is openbaar toegankelijk; iedereen met de URL kan gegevens wijzigen.

## Vereisten

- Node.js 20 of nieuwer
- Cloudflare Worker met een `workers.dev`-adres
- Cloudflare D1-database
- OpenAI API-sleutel
- Google Cloud-project met Cloud Text-to-Speech en Speech-to-Text API ingeschakeld
- Google Cloud Run voor de realtime Speech-to-Text gRPC-bridge

## Lokaal ontwikkelen

```sh
pnpm install
npx wrangler d1 migrations apply lashulp-db --local
npm run dev
```

Maak `.dev.vars` met lokale waarden voor `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `STT_BRIDGE_URL`, `STT_BRIDGE_HMAC` en (optioneel) `OPENAI_MODEL`, `DAILY_WARNING_USD`, `MODEL_INPUT_USD_PER_MILLION` en `MODEL_OUTPUT_USD_PER_MILLION`. Zet dit bestand nooit in Git. Start lokaal met `npm run build` en daarna `npx wrangler dev`.

## Cloudflare Workers

1. Maak D1 aan: `npx wrangler d1 create lashulp-db`.
2. Vul de geretourneerde database-ID in bij `database_id` in `wrangler.toml`.
3. Pas de migraties toe: `npx wrangler d1 migrations apply lashulp-db --remote`. De tweede migratie vult de bekende werkplaatsvoorraad uit het meegeleverde kennisbestand.
4. Stel de secrets hieronder in met `npx wrangler secret put OPENAI_API_KEY` en `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`. Stel ook `STT_BRIDGE_URL` en `STT_BRIDGE_HMAC` in via Wrangler of het Cloudflare-dashboard.
5. Deploy de Worker en statische app samen met `npm run deploy`. De Workernaam in `wrangler.toml` bepaalt het `workers.dev`-adres.

API-handlers staan in `functions/` en worden door `worker.ts` aan de Worker gekoppeld. De build kopieert de volledige, opgesplitste kennisbestanden naar de statische assets zodat alleen de relevante proceskennis in de systeemprompt terechtkomt. De bestanden zijn geen geheimen; API-sleutels blijven server-side.

## Google Cloud Run STT-bridge

Google Speech-to-Text realtime streaming gebruikt gRPC. Daarom ontvangt deze kleine Node-service PCM-audio via WebSocket en stuurt het door naar Google Cloud Speech-to-Text. De Pages Function geeft een kortlevend, eenmalig HMAC-ticket uit; de signing secret wordt nooit naar de browser gestuurd.

1. Schakel Speech-to-Text in en maak een runtime-serviceaccount met de rol `Cloud Speech Client`.
2. Maak een lange willekeurige waarde voor `STT_BRIDGE_HMAC` en bewaar die in Secret Manager.
3. Deploy vanuit de repository-root:

```sh
gcloud run deploy lashulp-stt \
  --source cloud-run/stt-bridge \
  --region europe-west4 \
  --allow-unauthenticated \
  --service-account lashulp-stt@PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets STT_BRIDGE_HMAC=lashulp-stt-hmac:latest
```

4. Stel de Pages-variabele `STT_BRIDGE_URL` in op de HTTPS-URL van de service en `STT_BRIDGE_HMAC` op dezelfde secretwaarde. De browser zet `https://` om naar `wss://` voor de audiostream. De bridge slaat audio en transcripties niet op en beëindigt een sessie uiterlijk na vier minuten.

## Secrets en variabelen

| Naam | Type | Doel |
| --- | --- | --- |
| `OPENAI_API_KEY` | Secret | Adviezen en tijdelijke fotoanalyse via OpenAI |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Secret | Google OAuth voor Nederlandse Text-to-Speech |
| `STT_BRIDGE_HMAC` | Secret | Gedeelde ondertekeningssleutel voor kortlevende STT-tickets |
| `STT_BRIDGE_URL` | Variabele | HTTPS-URL van de Cloud Run-bridge |
| `OPENAI_MODEL` | Variabele, optioneel | Modeloverride; standaard `gpt-4.1-mini` |
| `MAX_AI_WORDS` | Variabele | Maximaal aantal woorden in tekstadvies; standaard 200 |
| `RATE_LIMIT_PER_HOUR` | Variabele | Limiet per IP en API-route; standaard 60 |
| `DAILY_WARNING_USD` | Variabele | Drempel voor dagelijkse waarschuwing; leeg schakelt de waarschuwing uit |
| `MODEL_INPUT_USD_PER_MILLION` / `MODEL_OUTPUT_USD_PER_MILLION` | Variabelen | Tarieven voor de indicatieve dagelijkse kostenberekening; stel ze passend bij het gekozen model in |

Google Cloud Text-to-Speech vereist de rol `Cloud Text-to-Speech API User` voor het serviceaccount. `GOOGLE_SERVICE_ACCOUNT_JSON` bevat de serviceaccount-JSON; gebruik een secret en plaats deze nooit in browsercode of Git.

## Privacy, limieten en operationele notities

- De app heeft geen persoonlijke accounts en bewaart chatberichten of foto’s niet. D1 bevat gedeelde voorraad, geslaagde proefreferenties en geaggregeerde dagelijkse token/kostentotalen. OpenAI verwerkt de adviesvraag; `store: false` voorkomt Responses-applicatiestatus. OpenAI-abusemonitoring kan API-inhoud volgens de accountinstellingen tot 30 dagen bewaren. Deel geen persoonsgegevens; vraag bij OpenAI naar Modified Abuse Monitoring of Zero Data Retention als dat voor jullie account beschikbaar is.
- Foto-inhoud wordt alleen tijdens de analyse verstuurd en niet opgeslagen.
- De AI- en TTS/STT-routes hebben een limiet van 60 verzoeken per IP per uur. De limiter bewaart IP-adressen alleen tijdelijk in geheugen per actieve Worker-isolate; Cloudflare kan meerdere isolates gebruiken, waardoor dit een best-effort limiet is en geen harde factuurgrens.
- De dagelijkse budgetinstelling waarschuwt; hij blokkeert aanvragen niet. Voor de kostenraming moeten de modeltarieven overeenkomen met je OpenAI-prijsconfiguratie. Google-spraakkosten vallen niet in deze tokenraming.
- De beheer-API is openbaar, overeenkomstig de gekozen inrichting. Een bezoeker met de URL kan gedeelde voorraad en proefreferenties toevoegen, aanpassen en verwijderen.
- De kennisbron staat in `knowledge/shared.md`, `knowledge/tig.md` en `knowledge/migmag.md`. Houd machine-instellingen als startpunten aan en verifieer kritieke instellingen aan de machinehandleiding en in de werkplaats.

## Mappen

- `src/` — React-interface, chat, audio en beheer
- `functions/api/` — Pages API-routes voor advies, TTS, STT-ticket, voorraad en proefreferenties
- `functions/lib/` — gedeelde serverhulpfuncties
- `knowledge/` — startkennis, opgesplitst in gedeeld, TIG en MIG/MAG
- `migrations/` — D1-schema en initiële werkplaatsvoorraad
- `cloud-run/stt-bridge/` — Google gRPC streamingbridge
