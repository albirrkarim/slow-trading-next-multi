import type { InitialBalance } from "@/lib/trading";
import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * OKX Account Balance Response
 */
export interface AccountBalanceResponse {
  code: string;
  msg: string;
  data: Array<{
    adjEq: string; // Adjusted equity
    details: Array<{
      availBal: string; // Available balance
      availEq: string; // Available equity
      ccy: string; // Currency
      cashBal: string; // Cash balance
      frozenBal: string; // Frozen balance
      ordFrozen: string; // Frozen for orders
    }>;
    imr: string; // Initial margin requirement
    isoEq: string; // Isolated margin equity
    mgnRatio: string; // Margin ratio
    mmr: string; // Maintenance margin requirement
    notionalUsd: string; // Total notional in USD
    ordFroz: string; // Order frozen
    totalEq: string; // Total equity
    uTime: string; // Update time
  }>;
}

/**
 * Simplified balance info for a single asset
 */
export interface AssetBalance {
  ccy: string; // Currency
  available: number; // Available balance
  frozen: number; // Frozen balance
  total: number; // Total balance
  availableEquity?: number; // Available equity (for margin accounts)
  marginRatio?: number; // Margin ratio (for margin accounts)
  isolatedEquity?: number; // Isolated margin equity (for isolated margin)
}

/**
 * Retrieves account balance for a specific currency from OKX
 * Supports both spot and margin accounts
 *
 * @param ccy - Currency symbol (e.g., 'BTC', 'USDT', 'ETH')
 * @param useEquity - If true, use available equity instead of available balance (for margin accounts)
 * @returns Promise resolving to asset balance or null if not found
 *
 * @example
 * ```ts
 * // Spot balance
 * const balance = await getAsset('USDT');
 * console.log('Available USDT:', balance?.available);
 *
 * // Margin balance (uses equity)
 * const marginBalance = await getAsset('USDT', true);
 * console.log('Available equity:', marginBalance?.availableEquity);
 * ```
 */
export async function getAsset(
  ccy: string,
  useEquity: boolean = false
): Promise<AssetBalance | null> {
  try {

    const response = await requestPrivate<AccountBalanceResponse>(
      "/api/v5/account/balance",
      { ccy: ccy.toUpperCase() },
      "GET"
    );

    if (response.code !== "0" || !response.data || response.data.length === 0) {
      return null;
    }

    const accountData = response.data[0];
    const currencyDetail = accountData.details.find(
      (detail) => detail.ccy === ccy.toUpperCase()
    );

    if (!currencyDetail) {
      // Return zero balance if not found in account
      return {
        ccy: ccy.toUpperCase(),
        available: 0,
        frozen: 0,
        total: 0,
        availableEquity: 0,
      } as AssetBalance;
    }

    // For margin accounts, use available equity if requested
    const available = useEquity
      ? parseFloat(currencyDetail.availEq || currencyDetail.availBal)
      : parseFloat(currencyDetail.availBal);

    return {
      ccy: currencyDetail.ccy,
      available,
      frozen: parseFloat(currencyDetail.frozenBal),
      total: parseFloat(currencyDetail.cashBal),
      availableEquity: parseFloat(currencyDetail.availEq || "0"),
      marginRatio: accountData.mgnRatio
        ? parseFloat(accountData.mgnRatio)
        : undefined,
      isolatedEquity: accountData.isoEq
        ? parseFloat(accountData.isoEq)
        : undefined,
    };
  } catch (error) {
    tradeLog.error(`Error fetching balance for ${ccy}:`, error);
    return null;
  }
}

/**
 * Gets balance for a trading pair (e.g., "BTC-USDT")
 * Supports both spot and margin accounts
 *
 * @param instId - Instrument ID (e.g., "BTC-USDT")
 * @param useEquity - If true, use available equity instead of available balance (for margin accounts)
 * @returns Promise resolving to initial balance or null
 *
 * @example
 * ```ts
 * // Spot balance
 * const balance = await getBalance('BTC-USDT');
 * console.log('Base asset (BTC):', balance?.baseAsset);
 * console.log('Quote asset (USDT):', balance?.quoteAsset);
 *
 * // Margin balance
 * const marginBalance = await getBalance('BTC-USDT', true);
 * ```
 */
export async function getBalance(
  instId: string,
  useEquity: boolean = false
): Promise<InitialBalance | null> {
  const [baseAsset, quoteAsset] = instId.split("-");

  if (!quoteAsset) {
    // If no quote asset (e.g. single currency passed), handle gracefully or assume base only
    const base = await getAsset(baseAsset, useEquity);
    if (!base) return null;
    return {
      baseAsset: base.available,
      quoteAsset: 0 // or handle differently
    }
  }

  const base = await getAsset(baseAsset, useEquity);
  const quote = await getAsset(quoteAsset, useEquity);

  if (!base || !quote) {
    // console.error("Error fetching balances for", instId);
    return null;
  }

  return {
    quoteAsset: quote.available, // Available quote currency (e.g., USDT)
    baseAsset: base.available, // Available base currency (e.g., BTC)
  };
}
