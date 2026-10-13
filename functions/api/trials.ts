import { body, clean, json } from '../lib/http';
import type { Data } from '../lib/types';
type Trial = { world: 'tig'|'migmag'; material: string; thickness: string; joint: string; fitup?: string; result?: string; settings: string };
export async function onRequestGet({ request, env }: Data) {
  const world = new URL(request.url).searchParams.get('world') || 'tig';
  if (!['tig','migmag'].includes(world)) return json({ error: 'Onbekende laswereld.' }, 400);
  const { results } = await env.DB.prepare('SELECT * FROM trials WHERE world=? ORDER BY created_at DESC LIMIT 150').bind(world).all();
  return json({ trials: results || [] });
}
export async function onRequestPost({ request, env }: Data) {
  const trial = await body<Trial>(request);
  if (!['tig','migmag'].includes(trial.world) || !clean(trial.material, 120) || !clean(trial.thickness, 40) || !clean(trial.joint, 120) || !clean(trial.settings, 3000)) return json({ error: 'Vul materiaal, dikte, verbinding en instellingen in.' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO trials(id,world,material,thickness,joint,fitup,result,settings) VALUES(?,?,?,?,?,?,?,?)').bind(id, trial.world, clean(trial.material,120), clean(trial.thickness,40), clean(trial.joint,120), clean(trial.fitup,300), clean(trial.result,1200), clean(trial.settings,3000)).run();
  return json({ id }, 201);
}
