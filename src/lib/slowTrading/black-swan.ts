import { getExchange } from "@/lib/exchange";
import type { UnifiedKline } from "@/lib/exchange/types";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import blackSwan, { type BlackSwanState } from "@/lib/trading/black-swan";
import type { Position } from "@/lib/trading/models";
import slowTradingMutationQueue from "./mutation-queue";
import slowTradingNotifications from "./notifications";
import slowTradingStorage from "./storage";
import type { SlowTradingMode, SlowTradingStorageData } from "./types";

const MINUTE_MS = 60_000;
const CACHE_TTL_MS = 55_000;
const FETCH_CONCURRENCY = 4;

interface CandleCacheEntry {
  expiresAt: number;
  value: Promise<UnifiedKline[]>;
}

const candleCache = new Map<string, CandleCacheEntry>();
const protectiveModes = new Set<SlowTradingMode>();

export interface SlowTradingBlackSwanRunResult {
  forceExitSymbols: string[];
  mode: SlowTradingMode;
  next: BlackSwanState;
  previous: BlackSwanState;
}

function normalizeSymbol(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/_USDT$/, "");
}

/** Fetches a small 1m window, coalescing duplicate live/sandbox requests. */
async function getCandles(params: {
  currentTimeMs: number;
  storage: SlowTradingStorageData;
  symbol: string;
}): Promise<UnifiedKline[]> {
  const symbol = normalizeSymbol(params.symbol);
  const marketType = resolveMarketTypeForTradingMode(
    params.storage.config.tradingMode,
  );
  const key = [params.storage.config.exchangeType, marketType, symbol].join(
    ":",
  );
  const cached = candleCache.get(key);
  if (cached && cached.expiresAt > params.currentTimeMs) {
    return cached.value;
  }

  const exchange = getExchange(params.storage.config.exchangeType, {
    defaultTradingMode: params.storage.config.tradingMode,
  });
  const value = slowTradingStorage.account.runWithExchangeAccount(
    params.storage,
    () =>
      exchange.getKlines({
        symbol: `${symbol}_USDT`,
        interval: "1m",
        startTime: params.currentTimeMs - 65 * MINUTE_MS,
        endTime: params.currentTimeMs,
        limit: 70,
        marketType,
      }),
  );
  candleCache.set(key, {
    expiresAt: params.currentTimeMs + CACHE_TTL_MS,
    value,
  });

  try {
    return await value;
  } catch (error) {
    candleCache.delete(key);
    throw error;
  }
}

/** Runs limited-concurrency breadth requests to avoid exchange request bursts. */
async function getBreadthCandles(params: {
  currentTimeMs: number;
  storage: SlowTradingStorageData;
  symbols: string[];
}): Promise<Record<string, UnifiedKline[]>> {
  const output: Record<string, UnifiedKline[]> = {};
  const symbols = Array.from(
    new Set(params.symbols.map(normalizeSymbol).filter(Boolean)),
  ).filter((symbol) => symbol !== "BTC");
  let cursor = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(FETCH_CONCURRENCY, symbols.length) },
      async () => {
        while (cursor < symbols.length) {
          const symbol = symbols[cursor++];
          try {
            output[symbol] = await getCandles({
              currentTimeMs: params.currentTimeMs,
              storage: params.storage,
              symbol,
            });
          } catch {
            // Missing symbols are excluded from the valid breadth denominator.
          }
        }
      },
    ),
  );

  return output;
}

function isBtcWarning(
  state: BlackSwanState,
  storage: SlowTradingStorageData,
): boolean {
  const config = blackSwan.config.normalize(storage.config.blackSwan);
  return (
    (state.evidence?.btc[5]?.pct ?? 0) <=
      -config.btcWarning.fiveMinuteDrawdownPct ||
    (state.evidence?.btc[15]?.pct ?? 0) <=
      -config.btcWarning.fifteenMinuteDrawdownPct
  );
}

/** Marks positions selected by the configured downward-crisis exit policy. */
function markEmergencyExits(params: {
  storage: SlowTradingStorageData;
  mode: SlowTradingMode;
  state: BlackSwanState;
}): string[] {
  const config = blackSwan.config.normalize(params.storage.config.blackSwan);
  if (params.state.status !== "CRISIS" || config.exitPolicy === "FREEZE_ONLY") {
    return [];
  }

  const symbols = new Set<string>();
  for (const tradeSetting of params.storage.modes[params.mode].tradeSettings) {
    const symbol = normalizeSymbol(tradeSetting.symbol);
    for (const position of (tradeSetting.model_memory.positions ??
      []) as Position[]) {
      const shouldClose = blackSwan.emergency.shouldClose({
        direction: position.direction,
        exitPolicy: config.exitPolicy,
        tradingMode: params.storage.config.tradingMode,
      });
      if (!position.closed && shouldClose) {
        position.control = {
          ...position.control,
          forceExit: {
            reason: `BLACK_SWAN:${params.state.reason}`,
          },
        };
        symbols.add(symbol);
      }
    }
  }

  return Array.from(symbols).filter(Boolean);
}

/** Evaluates and persists one independent Risk Sentinel pass. */
async function runSlowTradingBlackSwan(): Promise<SlowTradingBlackSwanRunResult> {
  const runStartedAt = Date.now();
  const currentTimeMs = Date.now();
  const initial = await slowTradingStorage.data.load({ modeScope: "active" });
  const mode = slowTradingStorage.mode.getActive(initial);
  const config = blackSwan.config.normalize(initial.config.blackSwan);
  const previous = blackSwan.state.normalize(initial.modes[mode].blackSwan);

  let btcCandles: UnifiedKline[] = [];
  try {
    btcCandles = config.enabled
      ? await getCandles({ currentTimeMs, storage: initial, symbol: "BTC" })
      : [];
  } catch {
    // The pure detector converts unavailable/stale BTC data into fail-closed WATCH.
  }

  const firstPass = blackSwan.detector.evaluate({
    config,
    previous,
    currentTimeMs,
    btcCandles,
    mode,
  });
  if (blackSwan.state.isProtective(firstPass)) {
    protectiveModes.add(mode);
  } else {
    protectiveModes.delete(mode);
  }
  const breadthCandlesBySymbol =
    config.enabled && isBtcWarning(firstPass, initial)
      ? await getBreadthCandles({
          currentTimeMs,
          storage: initial,
          symbols: initial.config.symbols,
        })
      : undefined;

  const committed = await slowTradingMutationQueue.runExclusive(async () => {
    const latest = await slowTradingStorage.data.load({ modeScope: "active" });
    const latestMode = slowTradingStorage.mode.getActive(latest);
    const latestPrevious = blackSwan.state.normalize(
      latest.modes[latestMode].blackSwan,
    );
    const latestNext = blackSwan.detector.evaluate({
      config: blackSwan.config.normalize(latest.config.blackSwan),
      previous: latestPrevious,
      currentTimeMs,
      btcCandles,
      breadthCandlesBySymbol,
      mode: latestMode,
    });
    latest.modes[latestMode].blackSwan = latestNext;
    const forceExitSymbols = markEmergencyExits({
      storage: latest,
      mode: latestMode,
      state: latestNext,
    });
    const completedAt = Date.now();
    const durationMs = Math.max(0, completedAt - runStartedAt);
    const summary =
      `${latestMode} risk sentinel ${latestNext.status} (${latestNext.reason})` +
      ` | emergency exits ${forceExitSymbols.length}`;
    latest.modes[latestMode].lastRunAt = completedAt;
    latest.modes[latestMode].lastRunDurationMs = durationMs;
    latest.modes[latestMode].lastRunSummary = summary;
    latest.modes[latestMode].lastRunPerformance = {
      totalMs: durationMs,
      sections: [{ s: "blackSwan.total", ms: durationMs, n: 1 }],
    };
    latest.modes[latestMode].stageRuns = {
      ...(latest.modes[latestMode].stageRuns ?? {}),
      "risk-sentinel": {
        t: completedAt,
        ms: durationMs,
        symbols: 1 + Object.keys(breadthCandlesBySymbol ?? {}).length,
        reports: forceExitSymbols.length,
        summary,
        performance: latest.modes[latestMode].lastRunPerformance,
      },
    };
    await slowTradingStorage.mode.saveState(
      latestMode,
      latest.modes[latestMode],
    );
    return {
      forceExitSymbols,
      mode: latestMode,
      next: latestNext,
      previous: latestPrevious,
    };
  });

  await slowTradingNotifications.blackSwanAction.notify({
    ...committed,
    notification: initial.runtime.notification,
  });
  if (blackSwan.state.isProtective(committed.next)) {
    protectiveModes.add(committed.mode);
  } else {
    protectiveModes.delete(committed.mode);
  }
  return committed;
}

/** Records operator acknowledgement for the active mode's current recovery. */
async function acknowledgeSlowTradingBlackSwanRecovery() {
  return slowTradingMutationQueue.runExclusive(async () => {
    const storage = await slowTradingStorage.data.load({ modeScope: "active" });
    const mode = slowTradingStorage.mode.getActive(storage);
    const state = blackSwan.state.normalize(storage.modes[mode].blackSwan);
    if (state.status !== "RECOVERY") {
      throw new Error("Black Swan protection is not in RECOVERY.");
    }
    storage.modes[mode].blackSwan = blackSwan.state.acknowledge(state);
    await slowTradingStorage.mode.saveState(mode, storage.modes[mode]);
    return storage.modes[mode].blackSwan;
  });
}

const slowTradingBlackSwan = {
  recovery: {
    acknowledge: acknowledgeSlowTradingBlackSwanRecovery,
  },
  production: {
    run: runSlowTradingBlackSwan,
  },
  runtime: {
    /** Covers the short evidence-to-persistence window during a sentinel pass. */
    isProtectionPending: (mode: SlowTradingMode) => protectiveModes.has(mode),
  },
} as const;

export default slowTradingBlackSwan;
export { slowTradingBlackSwan };
