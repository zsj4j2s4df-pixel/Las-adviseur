// Best-effort per-isolate limit: IPs and request timestamps remain in memory only.
const buckets = new Map<string, number[]>();
export function rateAllowed(request: Request, limit = 60): boolean {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const fresh = (buckets.get(ip) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (fresh.length >= limit) return false;
  fresh.push(now);
  buckets.set(ip, fresh);
  if (buckets.size > 3000) {
    for (const [key, times] of buckets) if (!times.some((time) => now - time < 3600000)) buckets.delete(key);
  }
  return true;
}
