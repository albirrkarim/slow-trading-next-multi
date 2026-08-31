export const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]; // Add more as needed

export type BaseCurrency = "USDT" | "BNB";

/**
 * Binance Trading Fees
 * https://www.binance.com/en/fee/schedule
 *
 * Standard spot trading fees:
 * - Maker: 0.1%
 * - Taker: 0.1%
 * 
 * VIP levels and BNB discounts can reduce fees further
 */
export const BinanceFees = {
  transaction: {
    buy: {
      USDT: {
        takerFeePercent: 0.1, // 0.1% for spot trading
        makerFeePercent: 0.1, // 0.1% for spot trading
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
        takerFeePercent: 0.1,
        makerFeePercent: 0.1,
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
      fee: 0.0005,
    },
    ETH: {
      min: 0.01,
      fee: 0.003,
    },
    USDT: {
      min: 10,
      fee: 1,
    },
  },
};

