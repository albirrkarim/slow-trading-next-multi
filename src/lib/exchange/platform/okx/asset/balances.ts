import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * OKX Asset Balance Response (Funding Account)
 */
export interface AssetBalanceResponse {
    code: string;
    msg: string;
    data: Array<{
        avgPx: string; // Average price
        availBal: string; // Available balance
        bal: string; // Balance
        ccy: string; // Currency
        frozenBal: string; // Frozen balance
        valuationPx: string; // Valuation price
    }>;
}

/**
 * Simplified balance info for a single asset (Funding)
 */
export interface FundingAssetBalance {
    ccy: string; // Currency
    available: number; // Available balance
    frozen: number; // Frozen balance
    total: number; // Total balance
}

/**
 * Retrieves asset balances for the Funding account
 * 
 * @param ccy - Currency symbol (e.g., 'BTC', 'USDT') - Optional, if not provided returns all non-zero
 * @returns Promise resolving to array of asset balances
 */
export async function getFundingBalances(ccy?: string): Promise<FundingAssetBalance[]> {
    try {
        const params: Record<string, string> = {};
        if (ccy) {
            params.ccy = ccy.toUpperCase();
        }

        const response = await requestPrivate<AssetBalanceResponse>(
            "/api/v5/asset/balances",
            params,
            "GET"
        );

        if (response.code !== "0" || !response.data) {
            return [];
        }

        return response.data.map(item => ({
            ccy: item.ccy,
            available: parseFloat(item.availBal),
            frozen: parseFloat(item.frozenBal),
            total: parseFloat(item.bal)
        }));
    } catch (error) {
        tradeLog.error(`Error fetching funding balance${ccy ? ` for ${ccy}` : ''}:`, error);
        return [];
    }
}

/**
 * Retrieves funding balance for a specific currency
 */
export async function getFundingAsset(ccy: string): Promise<FundingAssetBalance | null> {
    const balances = await getFundingBalances(ccy);
    return balances.length > 0 ? balances[0] : null;
}
