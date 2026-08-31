import type { SlowQuickBacktestResult } from "@/lib/slowTrading";

export interface QuickBacktestTradeCountRow {
  [key: string]: number | string;
  count: number;
  symbol: string;
}

/**
 * Counts closed Quick Backtest trade-history rows by symbol for dashboard charts.
 */
export function buildQuickBacktestTradeCountBySymbol(
  history: SlowQuickBacktestResult["tradeHistory"],
): QuickBacktestTradeCountRow[] {
  const countBySymbol = new Map<string, number>();

  for (const trade of history) {
    const symbol = String(trade.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) {
      continue;
    }

    countBySymbol.set(symbol, (countBySymbol.get(symbol) ?? 0) + 1);
  }

  return [...countBySymbol.entries()]
    .map(([symbol, count]) => ({ count, symbol }))
    .sort(
      (left, right) =>
        right.count - left.count || left.symbol.localeCompare(right.symbol),
    );
}
