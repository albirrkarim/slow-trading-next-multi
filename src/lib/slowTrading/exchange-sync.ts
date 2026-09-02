import type { UnifiedPosition } from "@/lib/exchange/types";
import type { Position } from "@/lib/trading/models";
import tradingPosition from "@/lib/trading/position";
import type { VolatilityPoint } from "@/lib/dynamic";
import {
  applyPositionNetUsdtExtrema,
  computeClosedPositionMetrics,
} from "@/lib/trading/pnl";
import slowTradingShared from "./shared";
import slowTradingWatchReserve from "./watch-reserve";
import type { SlowTradingModeState } from "./types";
import slowTradingPositions from "./positions";

function getPositiveFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function resolveExchangePositionDirection(
  exchangePosition: UnifiedPosition,
  localPosition: Position,
): Position["direction"] {
  if (exchangePosition.side === "LONG") return "LONG";
  if (exchangePosition.side === "SHORT") return "SHORT";
  return localPosition.direction ?? "LONG";
}

/**
 * Applies exchange position values to the local SLOW open-position record.
 */
function applyExchangePositionToLocalPosition(params: {
  exchangePosition: UnifiedPosition;
  localPosition: Position;
  symbol: string;
}) {
  const { exchangePosition, localPosition, symbol } = params;
  const entryPrice =
    getPositiveFiniteNumber(exchangePosition.entryPrice) ??
    localPosition.exposure.averageEntryPrice;
  const quantity =
    getPositiveFiniteNumber(exchangePosition.amount) ?? localPosition.exposure.quantity;
  const leverage =
    getPositiveFiniteNumber(exchangePosition.leverage) ??
    localPosition.exposure.leverage ??
    1;
  const notionalUsdt =
    getPositiveFiniteNumber(exchangePosition.sizeUSDT) ?? entryPrice * quantity;
  const marginUsdt =
    getPositiveFiniteNumber(exchangePosition.marginUSDT) ??
    (leverage > 0 ? notionalUsdt / leverage : localPosition.exposure.marginUsdt);

  localPosition.symbol = symbol;
  localPosition.direction = resolveExchangePositionDirection(
    exchangePosition,
    localPosition,
  );
  localPosition.exposure.averageEntryPrice = entryPrice;
  localPosition.exposure.quantity = quantity;
  localPosition.exposure.notionalUsdt = notionalUsdt;
  localPosition.exposure.leverage = leverage;
  localPosition.exposure.marginUsdt = slowTradingWatchReserve.money.roundUsdt(
    marginUsdt ?? 0,
  );
}

/**
 * Builds the local closed-position row for a position that disappeared from the exchange.
 */
function closeLocalPositionFromExchange(params: {
  currentTimeMs: number;
  exitPrice?: number;
  position: Position;
  symbol: string;
  volatilityPoints: VolatilityPoint[];
}): { position: Position; releasedReserveUSDT: number } {
  const { currentTimeMs, position, symbol } = params;
  const exitPrice =
    getPositiveFiniteNumber(params.exitPrice) ?? position.exposure.averageEntryPrice;
  const closedPosition: Position = slowTradingShared.clone({
    ...position,
    symbol,
    closed: {
      t: currentTimeMs,
      source: "EXCHANGE",
      price: exitPrice,
      feeUsdt: 0,
      reason: "UNKNOWN",
      message: `[CLOSED_ON_EXCHANGE] ${symbol} disappeared from the exchange position list`,
    },
  });
  const metrics = computeClosedPositionMetrics(closedPosition, exitPrice);
  const intermediateVPoints = tradingPosition.vPoints.intermediate({
    position: closedPosition,
    volatilityPoints: params.volatilityPoints,
  });
  if (intermediateVPoints) {
    closedPosition.vPoints = intermediateVPoints;
  }
  const releasedReserveUSDT =
    slowTradingWatchReserve.reserve.getReservedRemainingUsdt(
      closedPosition.strategy.averaging,
    );

  if (metrics) {
    closedPosition.pnl.currentValueUsdt = metrics.netCurrentUSDT;
    closedPosition.pnl.netPct = metrics.netProfitPercent;
    closedPosition.pnl.netUsdt = metrics.netProfitUSDT;
    // BOTH:POSITION_PNL_USDT_EXTREMA
    applyPositionNetUsdtExtrema(closedPosition, metrics.netProfitUSDT);
  }

  slowTradingWatchReserve.reserve.releaseRemaining(
    closedPosition.strategy.averaging,
  );

  return { position: closedPosition, releasedReserveUSDT };
}

/**
 * Synchronizes live local open-position records from exchange positions.
 */
export function syncLiveOpenPositionsFromExchange(params: {
  currentTimeMs: number;
  exchangePositions: UnifiedPosition[];
  latestPriceBySymbol?: Record<string, number>;
  modeState: SlowTradingModeState;
}): {
  adjustedCount: number;
  closedCount: number;
  releasedReserveUSDT: number;
} {
  const exchangePositionBySymbol = new Map(
    params.exchangePositions.map((position) => [
      slowTradingPositions.symbol.normalize(position.symbol),
      position,
    ]),
  );
  let adjustedCount = 0;
  let closedCount = 0;
  let releasedReserveUSDT = 0;

  for (const tradeSetting of params.modeState.tradeSettings) {
    const symbol = slowTradingPositions.symbol.normalize(tradeSetting.symbol);
    const positions = tradeSetting.model_memory.positions ?? [];
    if (!symbol || positions.length === 0) {
      continue;
    }

    const exchangePosition = exchangePositionBySymbol.get(symbol);
    if (exchangePosition) {
      // PROD:SYNC_ENTRY_POSITION_FROM_EXCHANGE
      applyExchangePositionToLocalPosition({
        exchangePosition,
        localPosition: positions[0],
        symbol,
      });
      tradeSetting.model_memory.positions = [positions[0]];
      adjustedCount += 1;
      continue;
    }

    if (!tradeSetting.model_memory.positionsSell) {
      tradeSetting.model_memory.positionsSell = [];
    }

    for (const position of positions) {
      // PROD:SYNC_ENTRY_POSITION_FROM_EXCHANGE
      const closed = closeLocalPositionFromExchange({
        currentTimeMs: params.currentTimeMs,
        exitPrice: params.latestPriceBySymbol?.[symbol],
        position,
        symbol,
        volatilityPoints:
          tradeSetting.model_memory.volatility?.lastVolatility ?? [],
      });
      tradeSetting.model_memory.positionsSell.push(closed.position);
      releasedReserveUSDT += closed.releasedReserveUSDT;
      closedCount += 1;
    }

    tradeSetting.model_memory.positions = [];
  }

  return {
    adjustedCount,
    closedCount,
    releasedReserveUSDT:
      slowTradingWatchReserve.money.roundUsdt(releasedReserveUSDT),
  };
}

/**
 * Grouped exchange-sync API for reconciling live exchange state.
 */
const slowTradingExchangeSync = {
  positions: {
    syncLiveOpen: syncLiveOpenPositionsFromExchange,
  },
  syncLiveOpenPositionsFromExchange,
} as const;

export default slowTradingExchangeSync;
export { slowTradingExchangeSync };
