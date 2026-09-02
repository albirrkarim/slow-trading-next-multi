import { deepCopy } from "@/components/client/utils";
import type { DynamicTradeMemory } from "@/lib/dynamic";
import {
  getReservedRemainingUsdt,
  releaseRemainingWatchReserve,
} from "@/lib/slowTrading/watch-reserve";
import { tradeLog } from "@/lib/trading";
import tradingPosition from "@/lib/trading/position";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  PositionCloseReason,
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import type { DataBacktestPurpose } from "@lib/brain/algorithms/type-execute";
import type { BacktestConfigDynamic } from "../type-backtest";
import { type VolatilityPoint } from "../utils/volatility";
import {
  calculateBacktestFeeAdjustedNetProfitUSDT,
  calculateBacktestNetProfitUSDT,
  resolveBacktestExitDecision,
} from "./exit-policy";
import { BACKTEST_ONE_SIDE_FEE_RATIO } from "./constants";
import { applyPositionNetUsdtExtrema } from "@/lib/trading/pnl";

const DEFAULT_BACKTEST_EXIT_MODEL_CONFIG: TradingModelConfig = {
  takeProfitPercent: 5,
};

interface TryToExitProps {
  currentTimeMs: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
  modelMemoryMap: Record<string, TradingModelMemory>;
  forceSell?: boolean;
  backtestPack: DataBacktestPurpose;
  config: BacktestConfigDynamic;
  modelConfig?: TradingModelConfig;
  dynamicTradeMemory: DynamicTradeMemory;
}

export function tryToExit({
  currentTimeMs,
  volatilityMap,
  modelMemoryMap,
  forceSell = false,
  backtestPack,
  config,
  modelConfig,
  dynamicTradeMemory,
}: TryToExitProps) {
  let totalUSDTRecovered = 0;
  const exitModelConfig =
    modelConfig ??
    config.modelConfig ??
    DEFAULT_BACKTEST_EXIT_MODEL_CONFIG;

  // 1. Calculate Global PnL for Cross Margin
  const globalUnrealizedPnL = calculateGlobalUnrealizedPnL({
    config,
    modelMemoryMap,
    volatilityMap,
  });

  const globalLiquidation =
    config.marginMode === "CROSS" &&
    // Simple check: if equity (balance + unrealized) <= 0 (Bankruptcy)
    // Or stricter: if maintenance margin is hit. For now use Bankruptcy.
    dynamicTradeMemory.quoteAsset + globalUnrealizedPnL <= 0;

  const coinsHaveOpenPositions = Object.keys(volatilityMap).filter(
    (symbol) => modelMemoryMap[symbol].positions.length > 0,
  );

  for (const symbol of coinsHaveOpenPositions) {
    const opensCoin = modelMemoryMap[symbol].positions;

    if (!modelMemoryMap[symbol].positionsSell) {
      modelMemoryMap[symbol].positionsSell = [];
    }

    const currentVolatility = volatilityMap[symbol].at(-1);
    if (!currentVolatility) continue;
    const lastVolatility = volatilityMap[symbol].at(-2);

    // Try to sell
    for (const open of [...opensCoin]) {
      const guardLabel = open.direction === "SHORT" ? "B" : "T";
      const hasHitTargetZone = volatilityMap[symbol].some(
        (point) => point.l === guardLabel && point.t >= open.opened.t,
      );
      const shouldForceSellPosition =
        forceSell || Boolean(open.control?.forceExit);

      const exitDecision = resolveBacktestExitDecision({
        position: open,
        currentPrice: currentVolatility.p,
        forceSell: shouldForceSellPosition,
        globalLiquidation,
        // BOTH:VOLATILITY_TARGET_TP
        hasHitTargetZone,
        // BOTH:POST_AVERAGE_RESCUE_EXIT
        lastVolatilityPrice: lastVolatility?.p,
        modelConfig: exitModelConfig,
        exitFeeRatio: BACKTEST_ONE_SIDE_FEE_RATIO,
      });

      if (!exitDecision.shouldExit) {
        // BOTH:POSITION_PNL_USDT_EXTREMA
        applyPositionNetUsdtExtrema(
          open,
          calculateBacktestFeeAdjustedNetProfitUSDT(
            open,
            currentVolatility.p,
            BACKTEST_ONE_SIDE_FEE_RATIO,
          ),
        );
      }

      if (exitDecision.shouldExit) {
        const isShort = open.direction === "SHORT";
        const positionsBefore = deepCopy(opensCoin);

        open.pnl.netPct = exitDecision.netProfitPercent;

        const isLiquidated =
          exitDecision.category === TRADE_MESSAGE.sell.LIQUIDATED_GLOBAL ||
          exitDecision.category === TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED;

        const grossProfitUsdt = isLiquidated
          ? -open.exposure.marginUsdt
          : calculateBacktestNetProfitUSDT(open, exitDecision.exitPrice);
        const recoveredMarginUsdt = Math.max(
          0,
          open.exposure.marginUsdt + grossProfitUsdt,
        );
        const exitNotionalUsdt =
          open.exposure.quantity * exitDecision.exitPrice;
        const fee = exitNotionalUsdt * BACKTEST_ONE_SIDE_FEE_RATIO;
        const recoveredMarginAfterFeeUsdt = Math.max(
          0,
          recoveredMarginUsdt - fee,
        );
        open.pnl.netUsdt = grossProfitUsdt - open.fees.entryUsdt - fee;
        // BOTH:POSITION_PNL_USDT_EXTREMA
        applyPositionNetUsdtExtrema(open, open.pnl.netUsdt);
        open.pnl.netPct =
          open.exposure.notionalUsdt > 0
            ? (open.pnl.netUsdt / open.exposure.notionalUsdt) * 100
            : 0;

        const message =
          `${TRADE_MESSAGE.sell.EXIT} ${open.symbol} (Entry ${open.opened.vPoint.lvl} Exit ${currentVolatility.lvl} Lev ${open.exposure.leverage}) ${open.direction} ` +
          `${exitDecision.category ?? ""} ${
          shouldForceSellPosition ? TRADE_MESSAGE.sell.FINAL : ""
        } `;
        const exitMessage = `${message} ${exitDecision.message} entry: ${open.exposure.averageEntryPrice} | exit: ${
          exitDecision.exitPrice
        } | triggerPrice: ${
          currentVolatility.p
        } | profit: ${open.pnl.netPct.toFixed(
          0,
        )}% | recoveredMargin: ${recoveredMarginUsdt.toFixed(
          2,
        )} | netProfitUSDT: ${open.pnl.netUsdt.toFixed(
          2,
        )} | fee: ${fee.toFixed(2)} | final: ${recoveredMarginAfterFeeUsdt.toFixed(2)}`;

        open.closed = {
          t: currentTimeMs,
          price: exitDecision.exitPrice,
          feeUsdt: fee,
          vPoint: {
            id: currentVolatility.id,
            lvl: currentVolatility.lvl,
          },
          reason: resolveBacktestCloseReason({
            category: exitDecision.category,
            force: shouldForceSellPosition,
            message: exitDecision.message,
          }),
          message: exitMessage,
        };
        const intermediateVPoints = tradingPosition.vPoints.intermediate({
          position: open,
          volatilityPoints: volatilityMap[symbol],
        });
        if (intermediateVPoints) {
          open.vPoints = intermediateVPoints;
        }
        open.pnl.currentValueUsdt = recoveredMarginAfterFeeUsdt;
        delete open.fees.estimatedExitUsdt;

        totalUSDTRecovered += recoveredMarginAfterFeeUsdt;
        // BOTH:WATCH_MECHANISM
        dynamicTradeMemory.reservedQuoteAsset = Math.max(
          0,
          (dynamicTradeMemory.reservedQuoteAsset ?? 0) -
            getReservedRemainingUsdt(open.strategy.averaging),
        );
        releaseRemainingWatchReserve(open.strategy.averaging);

        // remove from opens
        const idx = opensCoin.indexOf(open);
        if (idx !== -1) opensCoin.splice(idx, 1);

        tradeLog.log("\n\n");
        tradeLog.log(exitMessage);

        // push to closes
        modelMemoryMap[symbol].positionsSell.push(open);

        // save trade history
        backtestPack.tradeHistoryMap[symbol].push({
          time: currentTimeMs,
          side: isShort ? "BUY" : "SELL",
          price: exitDecision.exitPrice,
          fee,
          tax: 0,
          positionsBefore,
          positionsAfter: deepCopy(opensCoin),
          message: exitMessage,
          profit: open.pnl.netUsdt,
        });
      }
    }
  }

  return totalUSDTRecovered;
}

function resolveBacktestCloseReason(params: {
  category?: string;
  force: boolean;
  message?: string;
}): PositionCloseReason {
  if (params.force) return "FINAL";
  if (
    params.category === TRADE_MESSAGE.sell.LIQUIDATED_GLOBAL ||
    params.category === TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED
  ) {
    return "LIQUIDATED";
  }

  const message = String(params.message ?? "");
  if (message.includes("STOP_LOSS_BY_USDT_LOSS")) {
    return "STOP_LOSS_BY_USDT_LOSS";
  }
  if (message.includes("VOLATILITY_TARGET_SL")) {
    return "VOLATILITY_TARGET_SL";
  }
  if (message.includes("VOLATILITY_TARGET_TP")) {
    return "VOLATILITY_TARGET_TP";
  }
  if (message.includes("POST_AVERAGE_RESCUE_EXIT")) {
    return "POST_AVERAGE_RESCUE_EXIT";
  }
  if (message.includes("POST_AVERAGE_STOP_LOSS")) {
    return "POST_AVERAGE_STOP_LOSS";
  }
  if (message.includes("POST_AVERAGE_RESCUE_TP")) {
    return "POST_AVERAGE_RESCUE_TP";
  }
  if (message.includes("STOP_LOSS_PLUS")) return "STOP_LOSS_PLUS_TP";
  if (message.includes("TRADITIONAL_TP_SL")) {
    return params.category === TRADE_MESSAGE.sell.SL
      ? "STOP_LOSS"
      : "TAKE_PROFIT";
  }
  return "UNKNOWN";
}

export function calculateGlobalUnrealizedPnL({
  config,
  modelMemoryMap,
  volatilityMap,
}: {
  config: BacktestConfigDynamic;
  modelMemoryMap: Record<string, TradingModelMemory>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  let globalUnrealizedPnL = 0;
  if (config.marginMode === "CROSS") {
    for (const symbolKey of Object.keys(modelMemoryMap)) {
      const positions = modelMemoryMap[symbolKey].positions.filter(
        (p) => !p.closed,
      );
      // Get last price for symbol
      const lastPrice = volatilityMap[symbolKey]?.at(-1)?.p;

      if (lastPrice) {
        for (const pos of positions) {
          const isShort = pos.direction === "SHORT";

          let pnlUSDT = 0;
          if (isShort) {
            pnlUSDT = pos.exposure.quantity * pos.exposure.averageEntryPrice - pos.exposure.quantity * lastPrice;
          } else {
            pnlUSDT = pos.exposure.quantity * lastPrice - pos.exposure.quantity * pos.exposure.averageEntryPrice;
          }
          globalUnrealizedPnL += pnlUSDT;
        }
      }
    }
  }
  return globalUnrealizedPnL;
}
