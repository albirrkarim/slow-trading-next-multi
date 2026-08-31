import type { InitialBalance } from "@/lib/trading";
import type { BaseCurrency } from "../constants";
import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";


interface AccountAssetInfo {
  asset: string;
  free: number;
  locked: number;
}

/**
 * Response type for Account Asset Information endpoint.
 */
export interface AccountAssetInfoResponse {
  code: number;
  msg: string;
  data: {
    asset: string;
    free: string;
    locked: string;
  };
  timestamp: number;
}

/**
 * Retrieves account information for a specific asset from Tokocrypto.
 *
 * Returns the amount of the asset that is free and locked.
 *
 * @param {string} asset - The asset symbol (e.g., 'BTC', 'USDT', 'ADA').
 * @returns {Promise<AccountAssetInfoResponse>} The account's asset balance details.
 *
 * @example
 * ```ts
 * import { asset } from './accountAsset';
 *
 * async function getAssetInfo() {
 *   try {
 *     const response = await asset('ADA');
 *     console.log('Asset:', response.data.asset);
 *     console.log('Free balance:', response.data.free);
 *     console.log('Locked balance:', response.data.locked);
 *   } catch (error) {
 *     console.error('Failed to fetch asset info:', error);
 *   }
 * }
 * getAssetInfo();
 * ```
 */
export async function asset(symbol: string): Promise<AccountAssetInfo | null> {
  const data = await requestPrivate<AccountAssetInfoResponse>(
    "/open/v1/account/spot/asset",
    { asset: symbol.toUpperCase() },
    "get"
  );

  if (data.data) {
    return {
      asset: data.data.asset,
      free: parseFloat(data.data.free),
      locked: parseFloat(data.data.locked),
    };
  }

  return null;
}

export async function getBalance(
  symbol: string
): Promise<InitialBalance | null> {
  const sym = symbol.split("_"); // Split "BTC_USDT" into ["BTC", "USDT"]

  const baseAsset = sym[0]; // BTC
  const quoteAsset = sym[1] as BaseCurrency; // USDT

  const base = await asset(baseAsset);
  const quote = await asset(quoteAsset);

  if (!base || !quote) {
    tradeLog.error("Error fetching balances");
    return null;
  }

  return {
    quoteAsset: quote.free, // free USDT
    baseAsset: base.free, // free BTC
  };
}
