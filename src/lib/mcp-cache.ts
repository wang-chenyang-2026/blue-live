/**
 * TTL cache for MCP crawler query results.
 *
 * MCP download_data always returns the full 13-month window (month-2 to month-14),
 * regardless of any start/end parameters. So the data only changes when a new month
 * becomes available (roughly monthly). We can safely cache for hours.
 */

interface CacheEntry {
  data: unknown;
  expires: number;
}

// Crawler data is 13-month aggregated monthly data with 2-month delay.
// It changes at most once per month. Cache for 6 hours.
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

// Brand list changes even less frequently. Cache for 24 hours.
const BRAND_TTL_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, CacheEntry>();

// Periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expires < now) store.delete(key);
    }
  }, 30 * 60 * 1000).unref?.();
}

export function buildCacheKey(parts: (string | string[] | undefined | null)[]): string {
  return parts
    .map((p) => (Array.isArray(p) ? p.join('>') : String(p ?? '')))
    .join('|');
}

export function getCached<T = unknown>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function clearCache(): void {
  store.clear();
}

export const TTL = {
  DEFAULT: DEFAULT_TTL_MS,
  BRAND: BRAND_TTL_MS,
};
