import type { InitialBalance } from "@/lib/trading";
import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";
import binanceRequestCoordinator from "../request-coordinator";

/**
 * Binance Account Balance Response
 */
export interface AccountBalanceResponse {
  balances: Array<{
    asset: string; // Currency symbol (e.g., "BTC", "USDT")
    free: string; // Available balance
    locked: string; // Locked balance
  }>;
}

/**
 * Simplified balance info for a single asset
 */
export interface AssetBalance {
  asset: string; // Currency
  available: number; // Available balance
  frozen: number; // Frozen balance
  total: number; // Total balance
}

/**
 * Retrieves account balance for a specific currency from Binance
 *
 * @param asset - Currency symbol (e.g., 'BTC', 'USDT', 'ETH')
 * @returns Promise resolving to asset balance or null if not found
 *
 * @example
 * ```ts
 * const balance = await getAsset('USDT');
 * console.log('Available USDT:', balance?.available);
 * ```
 */
export async function getAsset(asset: string): Promise<AssetBalance | null> {
  try {
    const response = await requestPrivate<AccountBalanceResponse>(
      "/api/v3/account",
      {},
      "get",
    );

    if (!response.balances || response.balances.length === 0) {
      return null;
    }

    const currencyBalance = response.balances.find(
      (balance) => balance.asset === asset.toUpperCase(),
    );

    if (!currencyBalance) {
      return null;
    }

    return {
      asset: currencyBalance.asset,
      available: parseFloat(currencyBalance.free),
      frozen: parseFloat(currencyBalance.locked),
      total:
        parseFloat(currencyBalance.free) + parseFloat(currencyBalance.locked),
    };
  } catch (error) {
    if (binanceRequestCoordinator.error.isRateLimit(error)) throw error;
    tradeLog.error(`Error fetching balance for ${asset}:`, error);
    return null;
  }
}

/**
 * Gets balance for a trading pair (e.g., "BTCUSDT")
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Promise resolving to initial balance or null
 *
 * @example
 * ```ts
 * const balance = await getBalance('BTCUSDT');
 * console.log('Base asset (BTC):', balance?.baseAsset);
 * console.log('Quote asset (USDT):', balance?.quoteAsset);
 * ```
 */
export async function getBalance(
  symbol: string,
): Promise<InitialBalance | null> {
  // 1. Try treating it as a single asset first (e.g. "USDT")
  // Optimistic check: if it has no separator and length is short?
  // Or just try getAsset? getAsset logs error if fails, so might be noisy if we try every pair.
  // Better: Check known quotes strictly, OR if splitting fails.

  if (["USDT", "BTC", "ETH", "BNB", "USDC", "FDUSD"].includes(symbol)) {
    const asset = await getAsset(symbol);
    if (asset) {
      return {
        quoteAsset: asset.available,
        baseAsset: 0,
        total: asset.total,
      };
    }
  }

  // Extract base and quote assets from symbol (e.g., "BTCUSDT" -> "BTC" and "USDT")
  // This is a simple approach - assumes last 4 chars are quote (USDT, BUSD, etc.)
  // For more robust parsing, you might want to use exchange info
  let baseAsset = "";
  let quoteAsset = "";

  // Common quote assets
  const quoteAssets = ["USDT", "BUSD", "USDC", "BNB", "BTC", "ETH"];
  for (const quote of quoteAssets) {
    if (symbol.endsWith(quote) && symbol !== quote) {
      quoteAsset = quote;
      baseAsset = symbol.slice(0, -quote.length);
      break;
    }
  }

  if (!baseAsset || !quoteAsset) {
    // Fallback: assume last 4 chars are quote
    // But verify length to avoid slice on "USDT" becoming ""/""
    if (symbol.length > 4) {
      quoteAsset = symbol.slice(-4);
      baseAsset = symbol.slice(0, -4);
    } else {
      // likely single asset that wasn't caught above or invalid
      // Try one last time as asset
      const asset = await getAsset(symbol);
      if (asset) {
        return {
          quoteAsset: asset.available,
          baseAsset: 0,
          total: asset.total,
        };
      }
      tradeLog.error("Error parsing symbol for balance:", symbol);
      return null;
    }
  }

  const base = await getAsset(baseAsset);
  const quote = await getAsset(quoteAsset);

  if (!base || !quote) {
    // console.error("Error fetching balances for", symbol); // Suppress generic error, let getAsset log specifics if needed
    return null;
  }

  return {
    quoteAsset: quote.available, // Available quote currency (e.g., USDT)
    baseAsset: base.available, // Available base currency (e.g., BTC)
  };
}
