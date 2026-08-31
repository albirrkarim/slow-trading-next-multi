import { timeMsToReadable } from "@/lib/datasets/utils";
import type { ExchangeType, TradingMode } from "@/lib/exchange";
import { getExchange } from "@/lib/exchange";
import { tradeLog } from "@/lib/trading/helper/log";
import { mergePositions } from "@/lib/trading/helper/utils";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import volatilityTargetStopLoss from "@/lib/trading/volatility-target-stop-loss";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type {
  Position,
  TradeDecision,
  TradingModelConfig,
  TradingModelMemory,
} from "../../models";
import { sellPosition } from "../../models/utils";

interface DynamicExitProps {
  symbol: string;
  current: Kline;
  config: TradingModelConfig;
  memory: TradingModelMemory;

  exchangeType: ExchangeType;
  tradingMode: TradingMode;
  bypass?: boolean;
}

/**
 * Dynamic V2 - Multi trading mode
 *
 * It can be spot and future
 */
export async function dynamicExit({
  symbol,
  current,
  config,
  memory,
  exchangeType,
  tradingMode,
  bypass = false,
}: DynamicExitProps): Promise<TradeDecision> {
  // A. Initialize =================================================================================
  const price = parseFloat(current[4]);
  const time = current[0];
  const readableTime = timeMsToReadable(time);

  const exchange = getExchange(exchangeType, {
    defaultTradingMode: tradingMode,
  });

  if (!memory.positionsSell) {
    memory.positionsSell = [];
  }

  if (!memory.volatility) {
    memory.volatility = {
      symbol,
      lastVolatility: [],
    };
  }

  // B. Manual Action =================================================================================
  const roundTripFee =
    exchange.getFees().getBothSideFeePercent({
      type: config.orderType ?? "taker",
    }) / 100;

  // B.1 FORCE SELL all
  if (memory.forceSell || bypass) {
    const positions = memory.positions as Position[];
    const lastPosition = mergePositions(positions);

    if (lastPosition) {
      // const totalUSDT = lastPosition.usdt ?? 0; // Total coin quantity
      const totalQuantity = lastPosition.exposure.quantity ?? 0; // Total coin quantity
      const avgEntry = lastPosition.exposure.averageEntryPrice; // Average entry price

      const isShort = lastPosition.direction === "SHORT";
      const grossGain = isShort
        ? (avgEntry - price) / avgEntry
        : (price - avgEntry) / avgEntry; // Raw gain %
      const netGain = grossGain - roundTripFee; // Net gain after fees. 0-1

      const reason = `[SELL] ${readableTime} ${
        TRADE_MESSAGE.sell.FINAL
      } ${bypass ? "(Bypass)" : ""}  FINAL SELL hit at ${(netGain * 100).toFixed(2)}% | Category ${
        lastPosition?.strategy.entry.label
      }`;

      sellPosition({
        currentKline: current,
        memory,
        exitMessage: reason,
        closeReason: "FINAL",
        roundTripFeeRatio: roundTripFee,
      });

      // turn off back
      delete memory.forceSell;

      return {
        action: "SELL",
        price,
        amount: totalQuantity,
        category: TRADE_MESSAGE.sell.FINAL,
        reason,
        profit: netGain,
        position: lastPosition, // position mana yang dijual
        emailNotif: `[SELL] FINAL SELL`,
      };
    } else {
      tradeLog.debug("Force sell but no positions!");
    }
  }

  // B.2 Force sell some positions
  const positionsNeedToSell = (memory.positions as Position[]).filter(
    (position) => position.control?.forceExit,
  );

  if (positionsNeedToSell.length > 0) {
    const pos = memory.positions as Position[];

    for (let index = 0, len = pos.length; index < len; index++) {
      const targetPosition = pos[index];

      if (targetPosition.control?.forceExit) {
        const totalQuantity = targetPosition.exposure.quantity ?? 0; // Total coin quantity
        const avgEntry = targetPosition.exposure.averageEntryPrice; // Average entry price

        const isShort = targetPosition.direction === "SHORT";
        const grossGain = isShort
          ? (avgEntry - price) / avgEntry
          : (price - avgEntry) / avgEntry; // Raw gain %
        const netGain = grossGain - roundTripFee; // Net gain after fees. 0-1

        const reason = `[SELL] ${readableTime} ${
          TRADE_MESSAGE.sell.FINAL
        } FINAL SELL hit at ${(netGain * 100).toFixed(2)}% | Category ${
          targetPosition?.strategy.entry.label
        } | Reason ${targetPosition.control.forceExit.reason}`;

        sellPosition({
          currentKline: current,
          memory,
          exitMessage: reason,
          closeReason: "FORCED",
          index,
          roundTripFeeRatio: roundTripFee,
        });

        // turn off back
        delete targetPosition.control.forceExit;
        if (Object.keys(targetPosition.control).length === 0) {
          delete targetPosition.control;
        }

        return {
          action: "SELL",
          price,
          amount: totalQuantity,
          category: TRADE_MESSAGE.sell.FINAL,
          reason,
          profit: netGain,
          position: targetPosition,
          emailNotif: `[SELL] FINAL SELL`,
        };
      }
    }
  }

  // C. EXIT LOGIC (Stop Loss / Trailing Stop) =================================================================================
  const positions = memory.positions as Position[];

  const lastPosition = positions.at(-1);

  if (!lastPosition) {
    return {
      action: "HOLD",
      reason: `${TRADE_MESSAGE.hold} ${symbol} - No positions to manage`,
    };
  }

  const totalQuantity = lastPosition?.exposure.quantity ?? 0;
  const totalUSDT = lastPosition?.exposure.notionalUsdt ?? 0;

  const avgEntry = lastPosition?.exposure.averageEntryPrice ?? 0;

  const isShort = lastPosition?.direction === "SHORT";
  const grossGain = isShort
    ? (avgEntry - price) / avgEntry
    : (price - avgEntry) / avgEntry;
  const netGain = grossGain - roundTripFee;
  const netCurrentUSDT = totalUSDT * (1 + netGain);
  const netProfitUSDT = netCurrentUSDT - totalUSDT;
  const lastVolatility = memory.volatility.lastVolatility.at(-1);
  const lastVPrice = lastVolatility?.p ?? 0;
  const direction = lastPosition.direction || "LONG";
  const targetZoneLabel = direction === "LONG" ? "T" : "B";
  const entryTime = lastPosition.opened.t ?? 0;
  const hasHitTargetZone = memory.volatility.lastVolatility.some(
    (point) => point.l === targetZoneLabel && point.t >= entryTime,
  );

  // C.1 Exit at configured absolute vPoint level
  // PROD:EXIT_ON_VPOINT_LEVEL
  const configuredExitOnVPointAbsLevel = Math.max(
    0,
    Math.floor(Number(config.exitOnVPointAbsLevel) || 0),
  );
  const latestAbsVPointLevel = Number.isFinite(Number(lastVolatility?.lvl))
    ? Math.abs(Number(lastVolatility?.lvl))
    : null;

  if (
    configuredExitOnVPointAbsLevel > 0 &&
    latestAbsVPointLevel !== null &&
    latestAbsVPointLevel >= configuredExitOnVPointAbsLevel
  ) {
    const reason = `[SELL] ${readableTime} ${
      TRADE_MESSAGE.sell.SL
    } PROD:EXIT_ON_VPOINT_LEVEL latest absolute vPoint level ${latestAbsVPointLevel} reached configured level ${configuredExitOnVPointAbsLevel} | Net PnL ${(netGain * 100).toFixed(2)}%`;

    sellPosition({
      currentKline: current,
      memory,
      exitMessage: reason,
      closeReason: "EXIT_ON_VPOINT_LEVEL",
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      price,
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.SL,
      reason,
      profit: netGain,
      position: lastPosition,
      emailNotif: `😞 [SELL] vPoint level exit triggered`,
    };
  }

  // C.2 Stop loss by fee-adjusted net USDT loss
  // PROD:STOP_LOSS_BY_USDT_LOSS
  const configuredStopLossUSDT = Number(config.stopLossUSDT ?? 50);
  const stopLossUSDT =
    Number.isFinite(configuredStopLossUSDT) && configuredStopLossUSDT > 0
      ? configuredStopLossUSDT
      : 0;

  if (stopLossUSDT > 0 && netProfitUSDT <= -stopLossUSDT) {
    const reason = `[SELL] ${readableTime} ${
      TRADE_MESSAGE.sell.SL
    } PROD:STOP_LOSS_BY_USDT_LOSS net USDT PnL ${netProfitUSDT.toFixed(
      2,
    )} reached -${stopLossUSDT.toFixed(2)} USDT`;

    sellPosition({
      currentKline: current,
      memory,
      exitMessage: reason,
      closeReason: "STOP_LOSS_BY_USDT_LOSS",
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      price,
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.SL,
      reason,
      profit: netGain,
      position: lastPosition,
      emailNotif: `😞 [SELL] USDT stop loss triggered`,
    };
  }

  // C.3 Hard stop loss (only if defined)
  // BOTH:TRADITIONAL_TP_SL
  if (config.stopLossPercent) {
    if (netGain <= -config.stopLossPercent / 100) {
      const reason = `[SELL] ${readableTime} ${
        TRADE_MESSAGE.sell.SL
      } Stop loss hit at ${(netGain * 100).toFixed(2)}%`;

      sellPosition({
        currentKline: current,
        memory,
        exitMessage: reason,
        closeReason: "STOP_LOSS",
        roundTripFeeRatio: roundTripFee,
      });

      return {
        action: "SELL",
        price,
        amount: totalQuantity,
        category: TRADE_MESSAGE.sell.SL,
        reason,
        profit: netGain,
        position: lastPosition, // position mana yang dijual
        emailNotif: `😞 [SELL] Stop loss triggered`,
      };
    }
  }

  // BOTH:VOLATILITY_TARGET_SL_VALUE
  if (
    volatilityTargetStopLoss.shouldExit({
      feeAdjustedNetProfitPercent: netGain * 100,
      hasHitTargetZone,
      stopLossPercent: config.volatilityTargetStopLossPercent,
    })
  ) {
    const reason = `[SELL] ${readableTime} ${
      TRADE_MESSAGE.sell.SL
    } BOTH:VOLATILITY_TARGET_SL_VALUE at ${(netGain * 100).toFixed(
      2,
    )}% after ${targetZoneLabel} target zone | Price ${price}`;

    sellPosition({
      currentKline: current,
      memory,
      exitMessage: reason,
      closeReason: "VOLATILITY_TARGET_SL",
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      price,
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.SL,
      reason,
      profit: netGain,
      position: lastPosition,
      emailNotif: `😞 [SELL] Volatility target stop loss triggered`,
    };
  }

  const pctVPointPriceAndCurrentPrice =
    postAverageRescue.distance.calculateFavorablePercent({
      currentPrice: price,
      direction: lastPosition.direction,
      lastVolatilityPrice: lastVPrice,
    });

  const postAverageLoss = postAverageStopLoss.evaluate({
    config: config.postAverageStopLoss,
    netPnlPercent: netGain * 100,
    netPnlUsdt: netProfitUSDT,
    position: lastPosition,
  });

  // BOTH:POST_AVERAGE_STOP_LOSS
  if (postAverageLoss.shouldExit) {
    const threshold = postAverageLoss.threshold!;
    const reason =
      `[SELL] ${readableTime} ${
        TRADE_MESSAGE.sell.POST_AVERAGE_STOP_LOSS
      } BOTH:POST_AVERAGE_STOP_LOSS after ${
        postAverageLoss.completedAveragingCount
      } averaging execution(s)` +
      ` | Net PnL ${(netGain * 100).toFixed(2)}% / ${netProfitUSDT.toFixed(2)} USDT` +
      ` | Threshold ${threshold.maxNetPnlPct}% / ${threshold.maxNetPnlUsdt} USDT` +
      ` | Trigger ${postAverageLoss.hitPercent ? "pct" : ""}${
        postAverageLoss.hitPercent && postAverageLoss.hitUsdt ? "+" : ""
      }${postAverageLoss.hitUsdt ? "usdt" : ""}`;

    sellPosition({
      closeReason: "POST_AVERAGE_STOP_LOSS",
      currentKline: current,
      exitMessage: reason,
      index: memory.positions.length - 1,
      memory,
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.POST_AVERAGE_STOP_LOSS,
      emailNotif: `😞 [SELL] Post-average stop loss triggered`,
      position: lastPosition,
      price,
      profit: netGain,
      reason,
    };
  }

  const rescueExit = postAverageRescue.evaluate({
    netPnlPercent: netGain * 100,
    currentPrice: price,
    direction: lastPosition.direction,
    lastVolatilityPrice: lastVPrice,
    position: lastPosition,
    config: config.postAverageRescueExit,
  });

  // BOTH:POST_AVERAGE_RESCUE_EXIT
  if (rescueExit.shouldExit) {
    const reason =
      `[SELL] ${readableTime} ${
        TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT
      } Post-average rescue exit at ${(netGain * 100).toFixed(
        2,
      )}% net PnL after ${rescueExit.completedAveragingCount} averaging execution(s)` +
      ` | Required net PnL ${rescueExit.minimumNetPnlPercent}%` +
      ` | Distance from last V point ${pctVPointPriceAndCurrentPrice.toFixed(
        2,
      )}% | Price ${price} | SELL (entry ${totalUSDT.toFixed(
        2,
      )} | now ${netCurrentUSDT.toFixed(2)} | Profit ${netProfitUSDT.toFixed(
        2,
      )}) | Category: ${lastPosition?.strategy.entry.label} | Volatility Level: ${
        lastVolatility?.lvl
      } ${lastVolatility?.l}`;

    sellPosition({
      currentKline: current,
      memory,
      index: memory.positions.length - 1,
      exitMessage: reason,
      closeReason: "POST_AVERAGE_RESCUE_EXIT",
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      price,
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT,
      reason,
      profit: netGain,
      position: lastPosition,
      emailNotif: `🔒 [SELL] Post-average rescue exit`,
    };
  }

  // C.2 STOP LOSS PLUS
  // PROD:SL_PLUS
  const useSLPlus =
    config.useStopLossPlus === undefined ? true : config.useStopLossPlus;

  if (useSLPlus) {
    const stopLossPlusTrigger = (config.stopLossPlusTrigger ?? 1) / 100;
    const memKey = `${symbol}-peakGain`;

    // Track peak gain once take profit threshold hit
    if (netGain >= config.takeProfitPercent / 100) {
      if (memory[memKey] == undefined) {
        memory[memKey] = netGain;
      }
    }

    // Update peak gain memory
    if (memory[memKey] !== undefined) {
      const peakGain: number = memory[memKey] ?? netGain;
      if (netGain > peakGain) {
        memory[memKey] = netGain;
      }

      // If price retraces from peak by stopLossPlusTrigger → SELL
      const drawdown = netGain - peakGain;
      if (drawdown <= -stopLossPlusTrigger) {
        delete memory[memKey]; // reset memory

        const reason = `[SELL] ${readableTime} - ${
          TRADE_MESSAGE.sell.SL_PLUS
        } Locked profit at ${(netGain * 100).toFixed(
          2,
        )}% | Price ${price} | SELL (entry ${totalUSDT.toFixed(
          2,
        )} | now ${netCurrentUSDT.toFixed(2)} | Profit ${netProfitUSDT.toFixed(
          2,
        )}) | Category: ${lastPosition?.strategy.entry.label}`;

        // Delete the last position
        sellPosition({
          currentKline: current,
          memory,
          index: memory.positions.length - 1,
          exitMessage: reason,
          closeReason: "STOP_LOSS_PLUS_TP",
          roundTripFeeRatio: roundTripFee,
        });

        return {
          action: "SELL",
          price,
          amount: totalQuantity,
          category: TRADE_MESSAGE.sell.SL_PLUS,
          reason,
          profit: netGain,
          position: lastPosition, // position mana yang dijual
          emailNotif: `🔒 [SELL] Stop Loss+ secured profit`,
        };
      }
    }
  }

  const currentPrice = price;

  const grossGainTarget = isShort
    ? (avgEntry - currentPrice) / avgEntry
    : (currentPrice - avgEntry) / avgEntry;

  const actualGain = grossGainTarget - roundTripFee;
  const actualCurrentUSDT = totalUSDT * (1 + actualGain);
  const actualProfitUSDT = actualCurrentUSDT - totalUSDT;

  // BOTH:VOLATILITY_TARGET_TP
  // C.3  TP when already hit volatility target zone.

  if (hasHitTargetZone && actualGain > 0) {
    // TP at current price
    const reason = `[SELL] ${readableTime} ${
      TRADE_MESSAGE.sell.TP
    } Volatility target zone hit at ${(actualGain * 100).toFixed(
      2,
    )}% | Its already ${targetZoneLabel} | Price ${price} | SELL (entry ${totalUSDT.toFixed(
      2,
    )} | now ${actualCurrentUSDT.toFixed(2)} | Profit ${actualProfitUSDT.toFixed(
      2,
    )}) | Category: ${lastPosition?.strategy.entry.label} | Volatility Level: ${
      lastVolatility?.lvl
    } | V Gain ${lastVolatility?.pct.toFixed(2)}% 
      `;

    // Delete the last position
    sellPosition({
      currentKline: current,
      memory,
      index: memory.positions.length - 1,
      exitMessage: reason,
      closeReason: "VOLATILITY_TARGET_TP",
      roundTripFeeRatio: roundTripFee,
    });

    return {
      action: "SELL",
      price,
      amount: totalQuantity,
      category: TRADE_MESSAGE.sell.TP,
      reason,
      profit: actualGain,
      position: lastPosition, // position mana yang dijual
      emailNotif: `🔒 [SELL] TP secured profit (volatility target hit)`,
    };
  }

  if (!useSLPlus) {
    // C.4 TRADITIONAL TAKE PROFIT
    // BOTH:TRADITIONAL_TP_SL
    if (actualGain >= config.takeProfitPercent / 100 && hasHitTargetZone) {
      const reason = `${TRADE_MESSAGE.sell.SELL} ${readableTime} - ${
        TRADE_MESSAGE.sell.TP
      } Locked profit at ${(actualGain * 100).toFixed(
        2,
      )}% | Price ${price} | SELL (entry ${totalUSDT.toFixed(
        2,
      )} | now ${actualCurrentUSDT.toFixed(2)} | Profit ${actualProfitUSDT.toFixed(
        2,
      )}) | Category: ${lastPosition?.strategy.entry.label} | Volatility Level: ${
        lastVolatility?.lvl
      } | V Gain ${lastVolatility?.pct.toFixed(2)}% 
      `;

      // Delete the last position
      sellPosition({
        currentKline: current,
        memory,
        index: memory.positions.length - 1,
        exitMessage: reason,
        closeReason: "TAKE_PROFIT",
        roundTripFeeRatio: roundTripFee,
      });

      return {
        action: "SELL",
        price,
        amount: totalQuantity,
        category: TRADE_MESSAGE.sell.TP,
        reason,
        profit: netGain,
        position: lastPosition, // position mana yang dijuall
        emailNotif: `🔒 [SELL] TP secured profit`,
      };
    } else {
      let reason = `${TRADE_MESSAGE.hold} ${symbol} - `;

      if (lastPosition) {
        const netGainVolatility =
          (lastVPrice - avgEntry) / avgEntry - roundTripFee;

        reason += `currentPrice(used): ${currentPrice.toFixed(
          2,
        )} | current price kline: ${price.toFixed(
          2,
        )} | Avg Entry Last Position: ${avgEntry.toFixed(
          2,
        )} | Net gain (using kline price): ${(netGain * 100).toFixed(
          2,
        )}% | Net gain (using volatility price): ${(
          netGainVolatility * 100
        ).toFixed(2)}% | Actual Gain: ${(actualGain * 100).toFixed(
          2,
        )}% | takeProfitPercent: ${config.takeProfitPercent.toFixed(2)}% | 

        Gross gain target: ${(grossGainTarget * 100).toFixed(2)}%
        Fees: ${(roundTripFee * 100).toFixed(2)}%

        | Last Volatility Price: ${lastVPrice.toFixed(2)} Level: ${
          lastVolatility?.lvl
        } ${lastVolatility?.l}
        `;
      } else {
        reason += `No last position`;
      }

      return {
        action: "HOLD",
        reason,
      };
    }
  }

  // D. DEFAULT → HOLD =================================================================================
  if (avgEntry) {
    const reason = `${
      TRADE_MESSAGE.hold
    } ${symbol} - Avg Entry Last Position: ${avgEntry.toFixed(
      2,
    )} | Net gain: ${(netGain * 100).toFixed(2)}%`;

    return {
      action: "HOLD",
      reason,
    };
  }

  return {
    action: "HOLD",
    reason: `${TRADE_MESSAGE.hold} ${symbol} - No signal`,
  };
}
