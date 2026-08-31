import type { CoinFinderJobError } from "@/lib/devBacktest/coins/types";

export interface CoinFinderJobErrorSummary {
  count: number;
  hiddenCount: number;
  key: string;
  message: string;
  symbols: string[];
  visibleSymbols: string[];
}

/** Groups repeated job errors so large symbol lists do not flood the dashboard. */
export function summarizeCoinFinderJobErrors(
  errors: CoinFinderJobError[],
  visibleSymbolLimit = 12,
): CoinFinderJobErrorSummary[] {
  const summaries = new Map<string, CoinFinderJobErrorSummary>();

  for (const error of errors) {
    const existing = summaries.get(error.message);
    if (existing) {
      existing.count += 1;
      existing.symbols.push(error.symbol);
      continue;
    }

    summaries.set(error.message, {
      count: 1,
      hiddenCount: 0,
      key: error.message,
      message: error.message,
      symbols: [error.symbol],
      visibleSymbols: [],
    });
  }

  return [...summaries.values()].map((summary) => ({
    ...summary,
    hiddenCount: Math.max(0, summary.symbols.length - visibleSymbolLimit),
    visibleSymbols: summary.symbols.slice(0, visibleSymbolLimit),
  }));
}
