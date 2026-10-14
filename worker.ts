import type { Env, Data } from './functions/lib/types';
import { onRequestPost as chat } from './functions/api/chat';
import {
  onRequestDelete as deleteInventory,
  onRequestGet as getInventory,
  onRequestPost as postInventory,
  onRequestPut as putInventory,
} from './functions/api/inventory';
import { onRequestPost as createSttSession } from './functions/api/stt-session';
import { onRequestPost as createLiveSession } from './functions/api/live-session';
import { onRequestPost as createTrial, onRequestGet as getTrials } from './functions/api/trials';
import { onRequestPost as textToSpeech } from './functions/api/tts';
import { json } from './functions/lib/http';

type Handler = (data: Data) => Promise<Response>;

const routes: Record<string, Partial<Record<string, Handler>>> = {
  '/api/chat': { POST: chat },
  '/api/inventory': {
    GET: getInventory,
    POST: postInventory,
    PUT: putInventory,
    DELETE: deleteInventory,
  },
  '/api/stt-session': { POST: createSttSession },
  '/api/live-session': { POST: createLiveSession },
  '/api/trials': { GET: getTrials, POST: createTrial },
  '/api/tts': { POST: textToSpeech },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const handlers = routes[new URL(request.url).pathname];
    const handler = handlers?.[request.method];
    if (handler) return handler({ request, env, params: {} });
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return json({ error: 'API-route niet gevonden.' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
