export const MAX_KLINES_PER_CALL = {
    "binance": 1000,
    "tokocrypto": 1000,
    "okx": 100
};

export const DEFAULT_EXCHANGE = process.env.EXCHANGE_TYPE || "tokocrypto";