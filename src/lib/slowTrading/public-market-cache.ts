interface PublicMarketCacheEntry<T> {
  expiresAt: number;
  value: T;
}

const completed = new Map<string, PublicMarketCacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
// PROD:PUBLIC_MARKET_CACHE_BOUNDED
const MAX_COMPLETED_ENTRIES = 256;

/** Removes every completed value whose freshness window has elapsed. */
function sweepExpired(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of completed) {
    if (entry.expiresAt <= now) {
      completed.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Keeps completed cache retention bounded by evicting oldest inserted keys. */
function trimCompleted(): void {
  while (completed.size > MAX_COMPLETED_ENTRIES) {
    const oldestKey = completed.keys().next().value;
    if (oldestKey === undefined) return;
    completed.delete(oldestKey);
  }
}

/** Returns the next aligned market interval boundary. */
function getNextBoundary(now: number, intervalMs: number): number {
  return (Math.floor(now / intervalMs) + 1) * intervalMs;
}

/** Coalesces one operation without retaining its completed result. */
async function runSingleFlight<T>(key: string, load: () => Promise<T>) {
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = load();
  const clearRequest = () => {
    if (inFlight.get(key) === request) {
      inFlight.delete(key);
    }
  };
  inFlight.set(key, request);
  void request.then(clearRequest, clearRequest);
  return request;
}

/** Returns a fresh cached value or joins the one in-progress loader. */
async function getOrLoad<T>(params: {
  expiresAt: number;
  key: string;
  load: () => Promise<T>;
  now?: number;
  shouldCache?: (value: T) => boolean;
}): Promise<T> {
  const now = params.now ?? Date.now();
  sweepExpired(now);
  const cached = completed.get(params.key) as
    | PublicMarketCacheEntry<T>
    | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  completed.delete(params.key);

  return runSingleFlight(params.key, async () => {
    const value = await params.load();
    if (params.shouldCache?.(value) ?? true) {
      completed.delete(params.key);
      completed.set(params.key, {
        expiresAt: params.expiresAt,
        value,
      });
      trimCompleted();
    }
    return value;
  });
}

function clear(): void {
  completed.clear();
  inFlight.clear();
}

/** Reports bounded process-lifetime cache occupancy for diagnostics. */
function getStats() {
  return {
    completedEntries: completed.size,
    inFlightEntries: inFlight.size,
    maxCompletedEntries: MAX_COMPLETED_ENTRIES,
  };
}

const slowTradingPublicMarketCache = {
  boundary: {
    next: getNextBoundary,
  },
  operation: {
    singleFlight: runSingleFlight,
  },
  state: {
    clear,
    getStats,
    sweepExpired,
  },
  value: {
    getOrLoad,
  },
} as const;

export default slowTradingPublicMarketCache;
