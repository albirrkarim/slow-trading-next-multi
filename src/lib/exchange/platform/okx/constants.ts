export const SUPPORTED_SYMBOLS = ["BTC-USDT", "ETH-USDT", "SOL-USDT"]; // Add more as needed

export type BaseCurrency = "USDT";

/**
 * OKX Trading Fees
 * https://www.okx.com/fees
 *
 * Fee tiers based on 30-day trading volume and OKB holdings
 */
export const OKXFees = {
  transaction: {
    buy: {
      USDT: {
        takerFeePercent: 0.08, // 0.08% for spot trading
        makerFeePercent: 0.06, // 0.06% for spot trading
        getTotalFeeTaker() {
          return this.takerFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent;
        },
      },
    },
    sell: {
      USDT: {
        takerFeePercent: 0.08,
        makerFeePercent: 0.06,
        getTotalFeeTaker() {
          return this.takerFeePercent;
        },
        getTotalFeeMaker() {
          return this.makerFeePercent;
        },
      },
    },
  },
  withdrawal: {
    BTC: {
      min: 0.0005,
      fee: 0.0004,
    },
    ETH: {
      min: 0.01,
      fee: 0.006,
    },
    USDT: {
      min: 2,
      fee: 1,
    },
  },
};
