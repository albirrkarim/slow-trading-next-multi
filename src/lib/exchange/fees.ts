import { OKXFees } from "@/lib/exchange/platform/okx/constants";
import { TokocryptoFees } from "@/lib/exchange/platform/tokocrypto/constants";
import { BinanceFees } from "@/lib/exchange/platform/binance/constants";
import type { ExchangeType, FeeCalculator } from "./types";

/**
 * OKX Fee Calculator
 * Wraps OKXFees with unified interface
 */
class OKXFeeCalculator implements FeeCalculator {
  getBothSideFeePercent(params: {
    currency?: string;
    type: "taker" | "maker";
  }): number {
    const { type } = params;
    const buyFee = OKXFees.transaction.buy.USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
    const sellFee = OKXFees.transaction.sell.USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
    return buyFee + sellFee;
  }

  getTotalFeePercent(params: {
    side: "buy" | "sell";
    currency?: string;
    type: "taker" | "maker";
  }): number {
    const { side, type } = params;
    return OKXFees.transaction[side].USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
  }
}

/**
 * Tokocrypto Fee Calculator
 * Wraps TokocryptoFees with unified interface
 */
class TokocryptoFeeCalculator implements FeeCalculator {
  getBothSideFeePercent(params: {
    currency?: string;
    type: "taker" | "maker";
  }): number {
    return TokocryptoFees.getBothSideFeePercent({
      currency: (params.currency as "USDT" | "IDR") || "USDT",
      type: params.type,
    });
  }

  getTotalFeePercent(params: {
    side: "buy" | "sell";
    currency?: string;
    type: "taker" | "maker";
  }): number {
    return TokocryptoFees.getTotalFeePercent({
      side: params.side,
      currency: (params.currency as "USDT" | "IDR") || "USDT",
      type: params.type,
    });
  }
}

/**
 * Binance Fee Calculator
 * Wraps BinanceFees with unified interface
 */
class BinanceFeeCalculator implements FeeCalculator {
  getBothSideFeePercent(params: {
    currency?: string;
    type: "taker" | "maker";
  }): number {
    const { type } = params;
    const buyFee = BinanceFees.transaction.buy.USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
    const sellFee = BinanceFees.transaction.sell.USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
    return buyFee + sellFee;
  }

  getTotalFeePercent(params: {
    side: "buy" | "sell";
    currency?: string;
    type: "taker" | "maker";
  }): number {
    const { side, type } = params;
    return BinanceFees.transaction[side].USDT[
      type === "taker" ? "getTotalFeeTaker" : "getTotalFeeMaker"
    ]();
  }
}

/**
 * Get fee calculator for a specific exchange
 * @param exchangeType - Exchange type
 * @returns Fee calculator instance
 */
export function getFeeCalculator(exchangeType: ExchangeType): FeeCalculator {
  switch (exchangeType) {
    case "okx":
      return new OKXFeeCalculator();
    case "tokocrypto":
      return new TokocryptoFeeCalculator();
    case "binance":
      return new BinanceFeeCalculator();
    default:
      throw new Error(`Unsupported exchange type: ${exchangeType}`);
  }
}

