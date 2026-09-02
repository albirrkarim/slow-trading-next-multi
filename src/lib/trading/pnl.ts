import type { Position } from "@/lib/trading/models";

function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function toPositiveNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function getReferenceEntryPrice(
  position: Pick<Position, "exposure">,
): number | null {
  const entryPrice = toPositiveNumber(position.exposure.averageEntryPrice);
  if (entryPrice) {
    return entryPrice;
  }

  const quantity = toPositiveNumber(position.exposure.quantity);
  const usdt = toPositiveNumber(position.exposure.notionalUsdt);
  return quantity && usdt ? usdt / quantity : null;
}

function getCostBasis(
  position: Pick<Position, "exposure">,
  referenceEntryPrice: number,
): number | null {
  const usdt = toPositiveNumber(position.exposure.notionalUsdt);
  if (usdt) {
    return usdt;
  }

  const quantity = toPositiveNumber(position.exposure.quantity);
  if (quantity) {
    return quantity * referenceEntryPrice;
  }

  return null;
}

export function computePositionNetGainRatio(
  position: Pick<Position, "direction" | "exposure">,
  price: number,
  roundTripFeeRatio = 0,
): number | null {
  const referenceEntryPrice = getReferenceEntryPrice(position);
  const currentPrice = toPositiveNumber(price);

  if (!referenceEntryPrice || !currentPrice) {
    return null;
  }

  const grossGain =
    position.direction === "SHORT"
      ? (referenceEntryPrice - currentPrice) / referenceEntryPrice
      : (currentPrice - referenceEntryPrice) / referenceEntryPrice;

  return grossGain - roundTripFeeRatio;
}

export function computeClosedPositionMetrics(
  position: Pick<Position, "direction" | "exposure">,
  exitPrice: number,
  roundTripFeeRatio = 0,
): {
  netCurrentUSDT: number;
  netProfitPercent: number;
  netProfitUSDT: number;
} | null {
  const netGainRatio = computePositionNetGainRatio(
    position,
    exitPrice,
    roundTripFeeRatio,
  );
  const referenceEntryPrice = getReferenceEntryPrice(position);

  if (netGainRatio === null || referenceEntryPrice === null) {
    return null;
  }

  const costBasis = getCostBasis(position, referenceEntryPrice);
  if (costBasis === null) {
    return null;
  }

  const netProfitUSDT = costBasis * netGainRatio;
  const netCurrentUSDT = costBasis + netProfitUSDT;

  return {
    netProfitPercent: roundTo(netGainRatio * 100, 3),
    netProfitUSDT: roundTo(netProfitUSDT, 3),
    netCurrentUSDT: roundTo(netCurrentUSDT, 3),
  };
}

/** Records the best and worst observed fee-aware USDT PnL on a position. */
export function applyPositionNetUsdtExtrema(
  position: Pick<Position, "pnl">,
  netUsdt: number,
): void {
  if (!Number.isFinite(netUsdt)) {
    return;
  }

  const observation = roundTo(netUsdt, 3);
  position.pnl.maxUpUsdt = Number.isFinite(position.pnl.maxUpUsdt)
    ? roundTo(Math.max(position.pnl.maxUpUsdt ?? observation, observation), 3)
    : observation;
  position.pnl.maxDownUsdt = Number.isFinite(position.pnl.maxDownUsdt)
    ? roundTo(Math.min(position.pnl.maxDownUsdt ?? observation, observation), 3)
    : observation;
}
