/**
 * Deep-clone a JSON-safe value used during signal generation and execution.
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Expand the configured symbol universe to include helper symbols needed by runtime logic.
 */
export function buildExecutionSymbols(symbols: string[]): string[] {
  const out = Array.from(
    new Set([...symbols.map((symbol) => symbol.toUpperCase()), "BTC"]),
  );
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * Gets the UTC month start used by decision-engine monthly trade counters.
 */
export function getUtcMonthStartMs(timeMs: number): number {
  const date = new Date(timeMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0);
}

export interface SlowTradingSkippedEntrySignal {
  symbol: string;
  reason: string;
}

/**
 * Adds a skipped entry reason once per symbol.
 */
export function addSkippedEntrySignal(
  skippedEntrySignals: SlowTradingSkippedEntrySignal[],
  skippedEntrySignal: SlowTradingSkippedEntrySignal,
) {
  const symbol = skippedEntrySignal.symbol.toUpperCase();
  if (
    skippedEntrySignals.some((item) => item.symbol.toUpperCase() === symbol)
  ) {
    return;
  }

  skippedEntrySignals.push({
    symbol,
    reason: skippedEntrySignal.reason,
  });
}

/**
 * Grouped shared API for SLOW orchestration utilities.
 */
const slowTradingShared = {
  clone,
  entrySignals: {
    addSkipped: addSkippedEntrySignal,
  },
  symbols: {
    buildExecution: buildExecutionSymbols,
  },
  time: {
    getUtcMonthStartMs,
  },
} as const;

export default slowTradingShared;
export { slowTradingShared };
