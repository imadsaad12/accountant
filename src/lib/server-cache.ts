type CacheEntry = { data: unknown; expiresAt: number };

const globalForCache = globalThis as unknown as { __serverCache: Map<string, CacheEntry> };
const store: Map<string, CacheEntry> = globalForCache.__serverCache ?? (globalForCache.__serverCache = new Map());

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data as T;
}

export function cacheSet(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(orgId: string, ...tags: string[]): void {
  for (const tag of tags) store.delete(`${orgId}:${tag}`);
}
