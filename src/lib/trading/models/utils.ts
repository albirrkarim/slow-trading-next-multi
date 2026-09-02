import type {
  Position,
  PositionCloseReason,
  PositionCloseSourceOverride,
  TradingModelMemory,
} from "./type";
import { TokocryptoFees, type Kline } from "@lib/exchange/platform/tokocrypto";
import { type VolatilityPoint } from "@lib/dynamic";
import {
  applyPositionNetUsdtExtrema,
  computeClosedPositionMetrics,
} from "@/lib/trading/pnl";
import tradingPosition from "@/lib/trading/position";

interface SellPosition {
  currentKline: Kline;
  memory: TradingModelMemory;
  index?: number | null;
  exitMessage?: string;
  closeReason?: PositionCloseReason;
  closeSource?: PositionCloseSourceOverride;
  roundTripFeeRatio?: number;
}

/**
 * Executes a sell action on one or all active positions in a trading model's memory.
 *
 * This function can:
 * - Sell a **specific position** if `index` is provided.
 * - Or **sell all open positions** if `index` is `null` (default).
 *
 * The function also logs sold positions into `memory.positionsSell`
 * and removes them from `memory.positions`.
 *
 * @function sellPosition
 * @param {Kline} currentKline - The current kline (candlestick) representing the latest market state.
 * @param {TradingModelMemory} memory - The model's in-memory state, including open and closed positions.
 * @param {number|null} [index=null] - Optional index of the specific position to sell. If `null`, all positions will be sold.
 *
 * @example
 * // Sell all open positions
 * sellPosition(currentKline, memory);
 *
 * // Sell only the first open position
 * sellPosition(currentKline, memory, 0);
 */
export function sellPosition({
  currentKline,
  memory,
  index = null,
  exitMessage,
  closeReason,
  closeSource,
  roundTripFeeRatio,
}: SellPosition) {
  if (!memory.positionsSell) {
    memory.positionsSell = [];
  }

  const lastVolatilityPoint = memory.volatility?.lastVolatility.at(-1);
  const volatilityPoints = memory.volatility?.lastVolatility ?? [];

  if (index !== null) {
    // Specific sell
    // Delete the last position
    const popped = memory.positions[index];

    if (popped) {
      exitPosition({
        currentKline,
        pos: popped,
        lastVolatilityPoint,
        volatilityPoints,
        exitMessage,
        closeReason,
        closeSource,
        roundTripFeeRatio,
      });

      memory.positionsSell.push(popped);

      memory.positions.splice(index, 1);
    }
  } else {
    // sell all
    const positions = memory.positions;

    for (const pos of positions) {
      exitPosition({
        currentKline,
        pos,
        lastVolatilityPoint,
        volatilityPoints,
        exitMessage,
        closeReason,
        closeSource,
        roundTripFeeRatio,
      });
    }

    // Reset position after selling
    memory.positionsSell.push(...positions);
    memory.positions = [];
  }
}

interface ExitPosition {
  currentKline: Kline;
  pos: Position;
  lastVolatilityPoint?: VolatilityPoint;
  volatilityPoints: VolatilityPoint[];
  exitMessage?: string;
  closeReason?: PositionCloseReason;
  closeSource?: PositionCloseSourceOverride;
  roundTripFeeRatio?: number;
}

/**
 * Closes an open trading position using the current kline data.
 * Calculates profit, duration, and applies trading fees.
 *
 * @param {Kline} currentKline - The current candlestick data used for exit.
 * @param {Position} pos - The position object to update with exit details.
 */
function exitPosition({
  currentKline,
  pos,
  lastVolatilityPoint,
  volatilityPoints,
  exitMessage,
  closeReason,
  closeSource,
  roundTripFeeRatio,
}: ExitPosition) {
  // Trading fees (round-trip: entry + exit)
  const roundTripFee =
    roundTripFeeRatio ??
    TokocryptoFees.getBothSideFeePercent({
      type: "taker", // kept as legacy fallback for older direct callers
    }) / 100;

  const exitPrice = parseFloat(currentKline[4]);
  const metrics = computeClosedPositionMetrics(pos, exitPrice, roundTripFee);
  if (!metrics) {
    return;
  }

  // C. PROFIT / LOSS
  // C.1 % PnL
  pos.pnl.netPct = metrics.netProfitPercent;

  // C.2 Current portfolio value at exit
  pos.pnl.currentValueUsdt = metrics.netCurrentUSDT;

  // C.3 Net PnL (USDT)
  pos.pnl.netUsdt = metrics.netProfitUSDT;
  // BOTH:POSITION_PNL_USDT_EXTREMA
  applyPositionNetUsdtExtrema(pos, metrics.netProfitUSDT);

  const totalFeeUsdt = pos.exposure.notionalUsdt * roundTripFee;
  const reason = closeReason ?? inferCloseReason(exitMessage);
  pos.closed = {
    t: currentKline[0],
    source: closeSource,
    price: exitPrice,
    feeUsdt: Math.max(0, totalFeeUsdt - pos.fees.entryUsdt),
    vPoint: lastVolatilityPoint
      ? { id: lastVolatilityPoint.id, lvl: lastVolatilityPoint.lvl }
      : undefined,
    reason,
    message: exitMessage ?? reason,
  };
  const intermediateVPoints = tradingPosition.vPoints.intermediate({
    position: pos,
    volatilityPoints,
  });
  if (intermediateVPoints) {
    pos.vPoints = intermediateVPoints;
  }
  delete pos.fees.estimatedExitUsdt;
}

function inferCloseReason(message?: string): PositionCloseReason {
  const normalized = String(message ?? "").toUpperCase();
  if (normalized.includes("EXIT_ON_VPOINT_LEVEL")) {
    return "EXIT_ON_VPOINT_LEVEL";
  }
  if (normalized.includes("STOP_LOSS_BY_USDT_LOSS")) {
    return "STOP_LOSS_BY_USDT_LOSS";
  }
  if (normalized.includes("VOLATILITY_TARGET_SL")) {
    return "VOLATILITY_TARGET_SL";
  }
  if (normalized.includes("VOLATILITY_TARGET_TP")) {
    return "VOLATILITY_TARGET_TP";
  }
  if (normalized.includes("POST_AVERAGE_RESCUE_EXIT")) {
    return "POST_AVERAGE_RESCUE_EXIT";
  }
  if (normalized.includes("POST_AVERAGE_STOP_LOSS")) {
    return "POST_AVERAGE_STOP_LOSS";
  }
  if (normalized.includes("POST_AVERAGE_RESCUE_TP")) {
    return "POST_AVERAGE_RESCUE_TP";
  }
  if (normalized.includes("STOP_LOSS_PLUS")) return "STOP_LOSS_PLUS_TP";
  if (normalized.includes("TAKE_PROFIT")) return "TAKE_PROFIT";
  if (normalized.includes("STOP_LOSS")) return "STOP_LOSS";
  if (normalized.includes("LIQUIDAT")) return "LIQUIDATED";
  if (normalized.includes("FINAL")) return "FINAL";
  if (normalized.includes("MANUAL")) return "MANUAL";
  if (normalized.includes("FORCE")) return "FORCED";
  return "UNKNOWN";
}
