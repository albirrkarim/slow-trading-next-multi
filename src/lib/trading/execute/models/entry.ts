import { decisionEngineLevelConfig } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import { timeMsToReadable } from "@/lib/datasets/utils";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { MINIMAL_USDT_TO_TRADE } from "@/lib/trading/constants";
import { tradeLog } from "@/lib/trading/helper/log";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  TradeDecision,
  TradingModelConfig,
  TradingModelMemory
} from "../../models/type";

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

interface DynamicEntryProps {
  symbol: string;
  current: Kline;
  config: TradingModelConfig
  memory: TradingModelMemory
  bypass?: boolean
  minActionableAbsoluteLevel?: number;
}

/**
 * Dynamic V2 - Multi trading mode
 * 
 * It can be spot and future
 */
export async function dynamicEntry({
  symbol,
  current,
  config,
  memory,
  bypass = false,
  minActionableAbsoluteLevel,
}: DynamicEntryProps): Promise<TradeDecision> {
  // A. Initialize
  const price = parseFloat(current[4]);
  const time = current[0];
  const readableTime = timeMsToReadable(time);

  if (!memory.positionsSell) {
    memory.positionsSell = [];
  }

  if (!memory.volatility) {
    memory.volatility = {
      symbol,
      lastVolatility: [],
    };
  }

  const volatility = memory.volatility.lastVolatility;
  const last = volatility.at(-1);
  const isEntryLevelActionable =
    last &&
    decisionEngineLevelConfig.isActionableLevel(
      last,
      minActionableAbsoluteLevel,
    );

  if (bypass && last && !isEntryLevelActionable) {
    return {
      action: "HOLD",
      reason:
        `[ENTRY_BELOW_MIN_ACTIONABLE_LEVEL] ${symbol} bypass entry skipped at ` +
        `volatility level ${last.lvl}`,
    };
  }

  if (bypass) {
    return {
      action: "BUY",
      category: TRADE_MESSAGE.buy.BYPASS,
      reason: `${TRADE_MESSAGE.buy.BYPASS} Force buy decision`,
      log: `${TRADE_MESSAGE.buy.BYPASS} Force buy decision at price ${price}`,
      amount: config.balanceUSDT,
      emailNotif: `📥 [BUY] Bypass Bought $${config.balanceUSDT} of ${symbol}`,
    };
  }

  const balanceUSDT = config.balanceUSDT ?? 0;
  const maxRiskPercent = config.maxRiskPercent ?? 100;

  // B.2 JUST BUY
  if (memory.justBuy !== undefined) {

    let amount =
      typeof memory.justBuy == "boolean" ? balanceUSDT : memory.justBuy;

    amount = Math.min(balanceUSDT, amount);

    const balanceLeft = balanceUSDT - amount;

    if (amount > 0 && last && isEntryLevelActionable) {
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

    if (last && !isEntryLevelActionable) {
      delete memory.justBuy;

      return {
        action: "HOLD",
        reason:
          `[ENTRY_BELOW_MIN_ACTIONABLE_LEVEL] ${symbol} manual entry skipped at ` +
          `volatility level ${last.lvl}`,
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
    if (
      last &&
      last.l === "B" &&
      isEntryLevelActionable
    ) {
      const confidence = 1;

      const amount = getPositionSize({
        confidence,
        balanceUSDT,
        maxRiskPercent,
      });

      if (amount > MINIMAL_USDT_TO_TRADE) {
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

        return {
          action: "HOLD",
          reason: `No enough balance for ${TRADE_MESSAGE.buy.ENTRY}`,
        };
      }
    }

    // C.2. ENTRY (SHORT)
    if (last && last.l === "T" && isEntryLevelActionable) {
      const confidence = 1;

      const amount = getPositionSize({
        confidence,
        balanceUSDT,
        maxRiskPercent,
      });

      if (amount > MINIMAL_USDT_TO_TRADE) {

        const log = `[SHORT] ${readableTime} - ${TRADE_MESSAGE.buy.ENTRY} ${TRADE_MESSAGE.buy.COMMON}, Price: ${price} | Level: ${last.lvl} | Confidence: ${confidence} | USDT: ${amount.toFixed(2)}`;

        return {
          action: "BUY",
          price,
          amount,
          category: TRADE_MESSAGE.buy.SHORT,
          reason: `${readableTime} - Confidence ${(confidence * 100).toFixed(0)}% | Shorting near resistance`,
          log,
          emailNotif: `📉 [SHORT] Shorted $${amount} of ${symbol}`,
          entryVPoint: { id: last.id, lvl: last.lvl },
        };
      }
    }
  }

  return {
    action: "HOLD",
    reason: `${TRADE_MESSAGE.hold} ${symbol} - No signal`,
  };
}
