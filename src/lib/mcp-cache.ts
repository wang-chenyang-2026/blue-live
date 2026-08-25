/**
 * Simple TTL cache for MCP crawler query results.
 * Prevents hitting BlueAI MCP rate limits when users rapidly switch filters.
 * Cache key is built from category_view + category_list + brand + date range.
 */

interface CacheEntry {
  data: unknown;
  expires: number;
}

// Default TTL: 10 minutes for crawler data (it's aggregated monthly, doesn't change rapidly)
const DEFAULT_TTL_MS = 10 * 60 * 1000;

// Longer TTL for brand list (brand composition rarely changes within a category)
const BRAND_TTL_MS = 30 * 60 * 1000;

const store = new Map<string, CacheEntry>();

// Periodic cleanup to avoid memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expires < now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
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
