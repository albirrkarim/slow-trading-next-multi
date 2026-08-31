import { timeMsToReadable } from "@/lib/datasets/utils";

import { TRADE_MESSAGE } from "@/lib/trading/message";
import { mergePositions } from "@/lib/trading/helper/utils";
import { getExchange } from "@/lib/exchange";
import type {
  GetTradingDecisionProps,
  Position,
  TradeDecision,
} from "../../type";
import { sellPosition } from "../../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Confidence-based Position Sizing
 *
 * Dynamically adjusts buy size depending on:
 * - Trend strength (SMA20 vs SMA50)
 * - Distance to support/resistance
 * - Volatility
 *
 * @param confidence Score between 0 and 1
 * @param balanceUSDT Available balance in USDT
 * @param maxRiskPercent Max % of balance to allocate per trade
 */
function getPositionSize({
  confidence,
  balanceUSDT,
  maxRiskPercent = 100,
}: {
  confidence: number;
  balanceUSDT: number;
  maxRiskPercent?: number;
}): number {
  const maxAlloc = balanceUSDT * (maxRiskPercent / 100);
  return Math.min(maxAlloc, balanceUSDT * confidence);
}

/**
 * Dynamic V2 - Multi trading mode
 * 
 * It can be spot and future
 */
export async function dynamicV2({
  symbol,
  current,
  config,
  memory,
}: Omit<GetTradingDecisionProps, "position">): Promise<TradeDecision> {
  // A. Initialize
  const price = parseFloat(current[4]);
  const time = current[0];
  const readableTime = timeMsToReadable(time);
  const exchange = getExchange("tokocrypto");

  if (!memory.positionsSell) {
    memory.positionsSell = [];
  }

  if (!memory.volatility) {
    memory.volatility = {
      symbol,
      lastVolatility: [],
    };
  }

  const balanceUSDT = config.balanceUSDT ?? 0;
  const maxRiskPercent = config.maxRiskPercent ?? 100;

  // B. Manual Action
  const roundTripFee = exchange.getFees().getBothSideFeePercent({
    type: config.orderType ?? "taker",
  }) / 100;

  // B.1 FORCE SELL all
  if (memory.forceSell) {
    const positions = memory.positions as Position[];
    const lastPosition = mergePositions(positions);

    if (lastPosition) {
      const totalQuantity = lastPosition.exposure.quantity ?? 0; // Total coin quantity
      const totalUSDT = lastPosition.exposure.notionalUsdt ?? 0; //  Total USDT invested

      const avgEntry = totalUSDT / totalQuantity; // Average entry price

      const grossGain = (price - avgEntry) / avgEntry; // Raw gain %
      const netGain = grossGain - roundTripFee; // Net gain after fees. 0-1

      const reason = `[SELL] ${readableTime} ${TRADE_MESSAGE.sell.FINAL
        } FINAL SELL hit at ${(netGain * 100).toFixed(2)}% | Category ${lastPosition?.strategy.entry.label
        }`;

      sellPosition({
        currentKline: current,
        memory,
        exitMessage: reason,
        closeReason: "FINAL",
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
        emailNotif: `[SELL] FINAL SELL`,
      };
    } else {
      tradeLog.debug("Force sell but no positions!");
    }
  }

  // force position sell?
  const positionsNeedToSell = (memory.positions as Position[]).filter(
    (position) => position.control?.forceExit
  );

  if (positionsNeedToSell.length > 0) {
    const pos = memory.positions as Position[];

    for (let index = 0, len = pos.length; index < len; index++) {
      const targetPosition = pos[index];

      if (targetPosition.control?.forceExit) {
        const totalQuantity = targetPosition.exposure.quantity ?? 0; // Total coin quantity
        const totalUSDT = targetPosition.exposure.notionalUsdt ?? 0; //  Total USDT invested

        const avgEntry = totalUSDT / totalQuantity; // Average entry price

        const grossGain = (price - avgEntry) / avgEntry; // Raw gain %
        const netGain = grossGain - roundTripFee; // Net gain after fees. 0-1

        const reason = `[SELL] ${readableTime} ${TRADE_MESSAGE.sell.FINAL
          } FINAL SELL hit at ${(netGain * 100).toFixed(2)}% | Category ${targetPosition?.strategy.entry.label
          } | Reason: ${targetPosition.control.forceExit.reason}`;

        sellPosition({
          currentKline: current,
          memory,
          exitMessage: reason,
          closeReason: "FORCED",
          index,
        });

        // turn off back
        delete targetPosition.control.forceExit;

        return {
          action: "SELL",
          price,
          amount: totalQuantity,
          category: TRADE_MESSAGE.sell.FINAL,
          reason,
          profit: netGain,
          emailNotif: `[SELL] FINAL SELL`,
        };
      }
    }
  }

  // B.2 JUST BUY
  if (memory.justBuy !== undefined) {
    const volatility = memory.volatility.lastVolatility;

    const last = volatility.at(-1);

    let amount =
      typeof memory.justBuy == "boolean" ? balanceUSDT : memory.justBuy;

    amount = Math.min(balanceUSDT, amount);

    const balanceLeft = balanceUSDT - amount;

    if (amount > 0 && last) {
      const qty = amount / price;

      const log = `[BUY] ${readableTime} - ${TRADE_MESSAGE.buy.HIT} ${memory.tToBuyMS
        ? "timeToBuyMS" + timeMsToReadable(memory.tToBuyMS ?? 0)
        : ""
        }, Price: ${price} | Level: ${last?.lvl} | Qty: ${qty.toFixed(
          5
        )} | USDT: ${amount.toFixed(2)} | Balance Left ${balanceLeft}`;

      const reason = `${readableTime} - Buying near support`;

      // turn off
      delete memory.justBuy;

      return {
        action: "BUY",
        price,
        amount,
        reason,
        category: TRADE_MESSAGE.buy.MANUAL,
        log,
        emailNotif: `📥 [BUY] Bought $${amount} of ${symbol}`,
        entryVPoint: { id: last.id, lvl: last.lvl },
      };
    }

    tradeLog.log(`No enough balance for ${TRADE_MESSAGE.buy.MANUAL}`, last);

    return {
      action: "HOLD",
      reason: `No enough balance for ${TRADE_MESSAGE.buy.MANUAL}`,
    };
  }

  // C. Automatic Action
  // C.1. ENTRY (BUY)
  if (!memory.onlySell) {
    const volatility = memory.volatility.lastVolatility;

    const last = volatility.at(-1);

    if (last && last.l === "B") {
      const confidence = 1;

      const amount = getPositionSize({
        confidence,
        balanceUSDT,
        maxRiskPercent,
      });

      if (amount > 0) {
        const qty = amount / price;

        const log = `[BUY] ${readableTime} - ${memory.positions.length == 0
          ? TRADE_MESSAGE.buy.ENTRY
          : TRADE_MESSAGE.buy.AGAIN
          } ${TRADE_MESSAGE.buy.COMMON} ${memory.tToBuyMS
            ? "timeToBuyMS" + timeMsToReadable(memory.tToBuyMS ?? 0)
            : ""
          }, Price: ${price} | Level: ${last.lvl
          } | Confidence: ${confidence} | Qty: ${qty.toFixed(
            5
          )} | USDT: ${amount.toFixed(2)}`;

        return {
          action: "BUY",
          price,
          amount,
          category: TRADE_MESSAGE.buy.COMMON,
          reason: `${readableTime} - Confidence ${(confidence * 100).toFixed(
            0
          )}% | Buying near support`,
          log,
          emailNotif: `📥 [BUY] Bought $${amount} of ${symbol}`,
          entryVPoint: { id: last.id, lvl: last.lvl },
        };
      } else {
        tradeLog.log(
          `No enough balance for ${TRADE_MESSAGE.buy.ENTRY}`,
          last
        );
      }
    }
  }

  // C.2 EXIT LOGIC (Stop Loss / Trailing Stop)
  const positions = memory.positions as Position[];

  const lastPosition = positions.at(-1);

  const totalQuantity = lastPosition?.exposure.quantity ?? 0;
  const totalUSDT = lastPosition?.exposure.notionalUsdt ?? 0;

  const totalUSDTNow = totalQuantity * price;

  const avgEntry = totalUSDT / totalQuantity;

  const grossGain = (price - avgEntry) / avgEntry;
  const netGain = grossGain - roundTripFee;

  // C.2.1 Hard stop loss (only if defined)
  if (config.stopLossPercent) {
    if (netGain <= -config.stopLossPercent / 100) {
      const reason = `[SELL] ${readableTime} ${TRADE_MESSAGE.sell.SL
        } Stop loss hit at ${(netGain * 100).toFixed(2)}%`;

      sellPosition({
        currentKline: current,
        memory,
        exitMessage: reason,
        closeReason: "STOP_LOSS",
      });

      return {
        action: "SELL",
        price,
        amount: totalQuantity,
        category: TRADE_MESSAGE.sell.SL,
        reason,
        profit: netGain,
        emailNotif: `😞 [SELL] Stop loss triggered`,
      };
    }
  }

  // C.2.2 STOP LOSS PLUS
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

        const reason = `[SELL] ${readableTime} - ${TRADE_MESSAGE.sell.SL_PLUS
          } Locked profit at ${(netGain * 100).toFixed(
            2
          )}% | Price ${price} | SELL (entry ${totalUSDT.toFixed(
            2
          )} | now ${totalUSDTNow.toFixed(2)} | Profit ${(
            totalUSDTNow - totalUSDT
          ).toFixed(2)}) | Category: ${lastPosition?.strategy.entry.label}`;

        // Delete the last position
        sellPosition({
          currentKline: current,
          memory,
          index: memory.positions.length - 1,
          exitMessage: reason,
          closeReason: "STOP_LOSS_PLUS_TP",
        });

        return {
          action: "SELL",
          price,
          amount: totalQuantity,
          category: TRADE_MESSAGE.sell.SL_PLUS,
          reason,
          profit: netGain,
          position: lastPosition, // position mana yang dijuall
          emailNotif: `🔒 [SELL] Stop Loss+ secured profit`,
        };
      }
    }
  } else {
    const lastVolatility = memory.volatility.lastVolatility.at(-1);

    const isManualBuy = lastPosition?.opened.reason === "MANUAL";
    const lastVPrice = lastVolatility?.p ?? 0;

    // Use price gain from manual buy or volatility price
    let currentPrice = isManualBuy ? price : lastVPrice;

    if (price < lastVPrice) {
      currentPrice = price;
    }

    const grossGainTarget = (currentPrice - avgEntry) / avgEntry;

    const actualGain = grossGainTarget - roundTripFee;

    // C.2.3 TRADITIONAL STOP LOSS
    if (actualGain >= config.takeProfitPercent / 100) {
      const reason = `${TRADE_MESSAGE.sell.SELL} ${readableTime} - ${TRADE_MESSAGE.sell.TP
        } Locked profit at ${(actualGain * 100).toFixed(
          2
        )}% | Price ${price} | SELL (entry ${totalUSDT.toFixed(
          2
        )} | now ${totalUSDTNow.toFixed(2)} | Profit ${(
          totalUSDTNow - totalUSDT
        ).toFixed(2)}) | Category: ${lastPosition?.strategy.entry.label
        } | Volatility Level: ${lastVolatility?.lvl
        } | V Gain ${lastVolatility?.pct.toFixed(2)}% 
      `;

      // Delete the last position
      sellPosition({
        currentKline: current,
        memory,
        index: memory.positions.length - 1,
        exitMessage: reason,
        closeReason: "TAKE_PROFIT",
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

        reason += `currentPrice: ${currentPrice.toFixed(
          2
        )} | Avg Entry Last Position: ${avgEntry.toFixed(
          2
        )} | Net gain (using kline price): ${(netGain * 100).toFixed(
          2
        )}% | Net gain (using volatility price): ${(
          netGainVolatility * 100
        ).toFixed(2)}% | Actual Gain: ${(actualGain * 100).toFixed(
          2
        )}% | takeProfitPercent: ${config.takeProfitPercent.toFixed(2)}% | 

        Gross gain target: ${(grossGainTarget * 100).toFixed(2)}%
        Fees: ${(roundTripFee * 100).toFixed(2)}%

        | Last Volatility Price: ${lastVPrice.toFixed(2)} Level: ${lastVolatility?.lvl
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

  // D. DEFAULT → HOLD
  if (avgEntry) {
    const reason = `${TRADE_MESSAGE.hold
      } ${symbol} - Avg Entry Last Position: ${avgEntry.toFixed(
        2
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
