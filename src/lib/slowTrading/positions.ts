import type { SlowTradingModeState } from "./types";

/**
 * Gets active positions with trade symbols from SLOW state or storage.
 */
export function getActivePositionsWithTradeSymbols(
  tradeSettings: SlowTradingModeState["tradeSettings"],
) {
  return tradeSettings.flatMap((setting) => {
    const symbol = String(setting.symbol || "")
      .trim()
      .toUpperCase();
    return (setting.model_memory.positions ?? []).map((position: any) => ({
      ...position,
      symbol: position.symbol ?? symbol,
    }));
  });
}

export function normalizePositionSymbol(symbol: string | undefined): string {
  const normalized = String(symbol || "")
    .trim()
    .toUpperCase();
  if (!normalized) return "";
  return normalized.includes("_")
    ? normalized.split("_")[0]
    : normalized.replace(/USDT$/, "");
}

/**
 * Grouped position API for SLOW runtime position helpers.
 */
const slowTradingPositions = {
  active: {
    withTradeSymbols: getActivePositionsWithTradeSymbols,
  },
  symbol: {
    normalize: normalizePositionSymbol,
  },
} as const;

export default slowTradingPositions;
export { slowTradingPositions };
