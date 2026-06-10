/**
 * Enkel rate limiting i minnet för synk-/import-/cron-endpoints.
 *
 * OBS: per serverless-instans. Det räcker som skydd mot dubbelklick och
 * skriptloopar; CRON_SECRET och inloggningskravet är de egentliga
 * skydden. Dessutom vägrar performSync starta när en körning redan pågår
 * (databasvakt i import_runs).
 */

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = Math.min(...hits);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSeconds: 0 };
}
