export const SUPPORTED_SYMBOLS = [
  "BTC_USDT",
  "ETH_USDT",
  "SOL_USDT",
  "USDT_IDR",
]; // Add more as needed

export type BaseCurrency = "IDR" | "USDT";

/**
 * https://support.tokocrypto.com/hc/id/articles/360004044591-Informasi-Biaya-Transaksi-di-Tokocrypto
 */
export const TokocryptoFees = {
  transaction: {
    buy: {
      IDR: {
        takerFeePercent: 0.2,
        makerFeePercent: 0.1,
        taxPercent: 0.11,
        cfxFeePercent: 0.0222,
        getTotalFeeTaker() {
          return this.takerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
      },
      USDT: {
        takerFeePercent: 0.15,
        makerFeePercent: 0.15,
        taxPercent: 0.21,
        cfxFeePercent: 0.0444,
        getTotalFeeTaker() {
          return this.takerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
      },
    },
    sell: {
      IDR: {
        takerFeePercent: 0.2,
        makerFeePercent: 0.1,
        taxPercent: 0.1,
        cfxFeePercent: 0.0222,
        getTotalFeeTaker() {
          return this.takerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
      },
      USDT: {
        takerFeePercent: 0.15,
        makerFeePercent: 0.15,
        taxPercent: 0.21,
        cfxFeePercent: 0.0444,
        getTotalFeeTaker() {
          return this.takerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent + this.taxPercent + this.cfxFeePercent;
        },
      },
    },
  },

  withdrawalFeeIDR: 10000, // fixed fee in IDR
  depositFeeEWalletPercent: 2, // 2% fee for e-wallet deposits

  /**
   * Calculate buy and sell fee
   * 2%
   */
  getBothSideFeePercent: ({
    currency = "USDT",
    type = "taker",
  }: {
    currency?: BaseCurrency;
    type: "taker" | "maker";
  }) => {
    const buyFee = TokocryptoFees.getTotalFeePercent({
      side: "buy",
      currency,
      type,
    });

    const sellFee = TokocryptoFees.getTotalFeePercent({
      side: "sell",
      currency,
      type,
    });

    return buyFee + sellFee;
  },

  /**
   * Calculates total fee percentage for a transaction
   * @param side 'buy' | 'sell'
   * @param currency 'IDR' | 'USDT'
   * @param type 'taker' | 'maker'
   * @returns total fee in percent (e.g., 0.3322)
   */
  getTotalFeePercent({
    side,
    currency = "USDT",
    type = "taker",
  }: {
    side: "buy" | "sell";
    currency?: BaseCurrency;
    type: "taker" | "maker";
  }): number {
    const fees = this.transaction[side][currency];
    return type === "taker" ? fees.getTotalFeeTaker() : fees.getTotalFeeMaker();
  },

  /**
   * Calculate total fee amount based on transaction value
   * @param side 'buy' | 'sell'
   * @param currency 'IDR' | 'USDT'
   * @param type 'taker' | 'maker'
   * @param amount transaction value in respective currency
   * @returns fee amount (same currency as amount)
   */
  calculateFeeAmount({
    side,
    currency = "USDT",
    type,
    amount,
  }: {
    side: "buy" | "sell";
    currency?: BaseCurrency;
    type: "taker" | "maker";
    amount: number;
  }): number {
    const feePercent = this.getTotalFeePercent({ side, currency, type });
    return (feePercent / 100) * amount;
  },
};

export interface TradingFeeProps {
  tradeQty: number;
  currentPrice: number;
  quoteAssetSymbol?: BaseCurrency;
  side: "buy" | "sell";
}

export interface TradingFeeReturn {
  tradingFee: {
    exchangeFee: number;
    tax: number;
  };
  tradingFeeTotal: number;
}

export function calculateTradingFee({
  tradeQty,
  currentPrice,
  quoteAssetSymbol = "USDT",
  side = "buy",
}: TradingFeeProps): TradingFeeReturn {
  // Gross value of position (quantity * current price)
  const gross = tradeQty * currentPrice;

  // Fee
  const exchangeFee = TokocryptoFees.calculateFeeAmount({
    side,
    currency: quoteAssetSymbol,
    type: "taker",
    amount: gross,
  });

  // Tax
  const taxPercent =
    TokocryptoFees.transaction[side][quoteAssetSymbol]?.taxPercent ?? 0;
  const tax = (taxPercent / 100) * gross;

  const tradingFee = {
    exchangeFee,
    tax,
  };

  const tradingFeeTotal = tradingFee.exchangeFee + tradingFee.tax;
  return { tradingFee, tradingFeeTotal };
}
