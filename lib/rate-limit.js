// Fixed-window, in-memory rate limiter keyed by client IP. Good enough for a
// single-instance intake form; swap for a shared store if you scale out.

export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  return function isAllowed(key) {
    const time = now();
    const entry = hits.get(key);
    if (!entry || time - entry.start >= windowMs) {
      hits.set(key, { start: time, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (time - v.start >= windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
