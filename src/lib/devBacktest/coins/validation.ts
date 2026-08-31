import type { Kline } from "@/lib/exchange/platform/tokocrypto";

export interface FuturesSymbolValidation {
  invalid: Array<{ message: string; symbol: string }>;
  valid: string[];
}

/** Checks each symbol with a small recent Binance Futures kline request. */
export async function validateFuturesSymbols({
  getKlines,
  isCancelled,
  onProgress,
  symbols,
}: {
  getKlines: (symbol: string) => Promise<Kline[]>;
  isCancelled?: () => boolean;
  onProgress: (completed: number, symbol: string) => void;
  symbols: string[];
}): Promise<FuturesSymbolValidation> {
  const valid: string[] = [];
  const invalid: FuturesSymbolValidation["invalid"] = [];

  for (const [index, symbol] of symbols.entries()) {
    if (isCancelled?.()) break;

    try {
      const klines = await getKlines(symbol);
      if (klines.length > 0) {
        valid.push(symbol);
      } else {
        invalid.push({
          message: "No recent Binance Futures klines found",
          symbol,
        });
      }
    } catch {
      invalid.push({
        message: "Not available as a Binance USDT Futures symbol",
        symbol,
      });
    }

    onProgress(index + 1, symbol);
  }

  return { invalid, valid };
}
