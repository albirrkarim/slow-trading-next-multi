interface PublicMarketCacheEntry<T> {
  expiresAt: number;
  value: T;
}

const completed = new Map<string, PublicMarketCacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

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
      completed.set(params.key, {
        expiresAt: params.expiresAt,
        value,
      });
    }
    return value;
  });
}

function clear(): void {
  completed.clear();
  inFlight.clear();
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
  },
  value: {
    getOrLoad,
  },
} as const;

export default slowTradingPublicMarketCache;
