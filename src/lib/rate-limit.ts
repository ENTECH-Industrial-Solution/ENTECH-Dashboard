/**
 * Coarse per-IP rate limiting for unauthenticated endpoints.
 *
 * NOTE: this is an in-memory limiter. On Vercel each serverless instance keeps
 * its own counter, so it slows down a naive attacker but is not a hard ceiling.
 * The authoritative brute-force control is the per-account lockout in
 * lib/auth/login-throttle.ts, which is database-backed. If you later need a real
 * distributed limit, swap this module's internals for Upstash Redis — the
 * exported signature is designed not to change.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory growth on long-lived instances.
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}
