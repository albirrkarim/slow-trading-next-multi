export type SlowTradingCycleSection =
  | "blackSwan.total"
  | "cycle.assignModelMemory"
  | "cycle.assignVolatility"
  | "cycle.autoRemoveSymbolLoad"
  | "cycle.autoRemoveSymbolSave"
  | "cycle.balanceRefresh"
  | "cycle.coinManagementMarketCaps"
  | "cycle.coinManagementPrices"
  | "cycle.currentTimeKlines"
  | "cycle.dailyPnlLimit"
  | "cycle.averagingExecution"
  | "cycle.cachePersist"
  | "cycle.entryExecution"
  | "cycle.exitExecution"
  | "cycle.exchangePositionSync"
  | "cycle.fundingRates"
  | "cycle.latestPrices"
  | "cycle.modeStatePersist"
  | "cycle.priceNorm"
  | "cycle.reportingSync"
  | "cycle.total"
  | "cycle.volume24hRead"
  | "cycle.volume24hRefresh"
  | "management.commit"
  | "management.marketCaps"
  | "management.prices"
  | "management.volatilityStorage"
  | "signals.assignModelMemory"
  | "signals.assignVolatility"
  | "signals.build"
  | "signals.currentTimeKlines"
  | "signals.historyHydration"
  | "signals.priceNorm"
  | "signals.recommendations"
  | "signals.writePriceNorm"
  | "storage.load";

export interface SlowTradingCyclePerformanceEntry {
  durationMs: number;
  finishedAt: number;
  section: SlowTradingCycleSection;
  startedAt: number;
}

export interface SlowTradingCyclePerformanceObserver {
  now?: () => number;
  onSection?: (entry: SlowTradingCyclePerformanceEntry) => void;
}

export interface SlowTradingCyclePerformanceSectionSummary {
  /** Section name. Uses a short key because this is persisted in mode memory. */
  s: SlowTradingCycleSection;
  /** Total milliseconds spent in this section for the completed cycle. */
  ms: number;
  /** Number of times the section was observed during the completed cycle. */
  n: number;
}

export interface SlowTradingCyclePerformanceSummary {
  /** Last completed cycle total duration in milliseconds. */
  totalMs: number;
  /** Timing summary grouped by profiler section, sorted by duration descending. */
  sections: SlowTradingCyclePerformanceSectionSummary[];
}

export interface SlowTradingCycleProfiler {
  time<T>(
    section: SlowTradingCycleSection,
    execute: () => Promise<T> | T,
  ): Promise<T>;
}

/**
 * Creates an opt-in cycle section profiler for tests and production diagnostics.
 */
export function createSlowTradingCycleProfiler(
  observer?: SlowTradingCyclePerformanceObserver,
): SlowTradingCycleProfiler {
  const now = observer?.now ?? Date.now;

  return {
    async time<T>(
      section: SlowTradingCycleSection,
      execute: () => Promise<T> | T,
    ): Promise<T> {
      const startedAt = now();
      try {
        return await execute();
      } finally {
        const finishedAt = now();
        observer?.onSection?.({
          durationMs: Math.max(0, finishedAt - startedAt),
          finishedAt,
          section,
          startedAt,
        });
      }
    },
  };
}

/**
 * Builds a compact persisted summary from raw cycle profiler events.
 */
export function summarizeSlowTradingCyclePerformance(
  entries: SlowTradingCyclePerformanceEntry[],
  totalMs: number,
): SlowTradingCyclePerformanceSummary {
  const sectionMap = new Map<
    SlowTradingCycleSection,
    SlowTradingCyclePerformanceSectionSummary
  >();

  for (const entry of entries) {
    if (entry.section === "cycle.total") {
      continue;
    }

    const current = sectionMap.get(entry.section);
    if (current) {
      current.ms += entry.durationMs;
      current.n += 1;
      continue;
    }

    sectionMap.set(entry.section, {
      s: entry.section,
      ms: entry.durationMs,
      n: 1,
    });
  }

  return {
    totalMs,
    sections: [...sectionMap.values()]
      .map((section) => ({
        ...section,
        ms: Math.round(section.ms),
      }))
      .sort((left, right) => right.ms - left.ms),
  };
}

const slowTradingPerformance = {
  cycle: {
    createProfiler: createSlowTradingCycleProfiler,
    summarize: summarizeSlowTradingCyclePerformance,
  },
} as const;

export default slowTradingPerformance;
