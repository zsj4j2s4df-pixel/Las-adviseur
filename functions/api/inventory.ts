import { body, clean, json } from '../lib/http';
import type { Data } from '../lib/types';

type Item = { id?: string; world: string; category: string; name: string; spec?: string; notes?: string; available?: boolean };
export async function onRequestGet({ request, env }: Data) {
  const world = new URL(request.url).searchParams.get('world') || 'tig';
  if (!['tig', 'migmag', 'shared'].includes(world)) return json({ error: 'Onbekende laswereld.' }, 400);
  const { results } = await env.DB.prepare('SELECT * FROM inventory WHERE world IN (?, \'shared\') ORDER BY category, name').bind(world).all();
  return json({ items: results || [] });
}
export async function onRequestPost({ request, env }: Data) {
  const item = await body<Item>(request);
  if (!['tig', 'migmag', 'shared'].includes(item.world) || !clean(item.category, 40) || !clean(item.name, 120)) return json({ error: 'Wereld, categorie en naam zijn verplicht.' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO inventory(id,world,category,name,spec,notes,available) VALUES(?,?,?,?,?,?,?)')
    .bind(id, item.world, clean(item.category, 40), clean(item.name, 120), clean(item.spec, 160), clean(item.notes, 1000), item.available === false ? 0 : 1).run();
  return json({ id }, 201);
}
export async function onRequestPut({ request, env }: Data) {
  const item = await body<Item>(request);
  if (!item.id || !['tig', 'migmag', 'shared'].includes(item.world) || !clean(item.category, 40) || !clean(item.name, 120)) return json({ error: 'Ongeldige invoer.' }, 400);
  await env.DB.prepare('UPDATE inventory SET world=?,category=?,name=?,spec=?,notes=?,available=?,updated_at=datetime(\'now\') WHERE id=?')
    .bind(item.world, clean(item.category, 40), clean(item.name, 120), clean(item.spec, 160), clean(item.notes, 1000), item.available === false ? 0 : 1, item.id).run();
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }: Data) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'Id ontbreekt.' }, 400);
  await env.DB.prepare('DELETE FROM inventory WHERE id=?').bind(id).run();
  return json({ ok: true });
}
