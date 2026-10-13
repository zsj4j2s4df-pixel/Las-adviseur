export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
export async function body<T>(request: Request): Promise<T> {
  return await request.json() as T;
}
export function clean(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export async function knowledge(env: { ASSETS: Fetcher }, world: 'tig' | 'migmag') {
  const files = world === 'tig' ? ['shared.md', 'tig.md'] : ['shared.md', 'migmag.md'];
  const parts = await Promise.all(files.map(async (file) => {
    const res = await env.ASSETS.fetch(new Request(`https://lashulp.local/knowledge/${file}`));
    return res.ok ? res.text() : '';
  }));
  return parts.join('\n\n');
}
