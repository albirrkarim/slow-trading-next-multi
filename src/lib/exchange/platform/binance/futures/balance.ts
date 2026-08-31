import type { UnifiedBalance } from "@/lib/exchange/types";
import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

interface FuturesBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
}

/**
 * Get Futures Account Balance
 * GET /fapi/v2/balance
 */
export async function getFuturesBalance(
  asset: string = "USDT",
): Promise<UnifiedBalance | null> {
  const FUTURES_BASE_URL = "https://fapi.binance.com";

  try {
    const balances = await requestPrivate<FuturesBalance[]>(
      "/fapi/v2/balance",
      {},
      "get",
      FUTURES_BASE_URL,
    );

    const targetBalance = balances.find((b) => b.asset === asset);

    if (!targetBalance) {
      return null;
    }

    return {
      quoteAsset: parseFloat(targetBalance.availableBalance), // For futures, usually quote asset is what matters for margin
      baseAsset: 0, // Not really applicable for single asset balance check
      total: parseFloat(targetBalance.balance),
      available: parseFloat(targetBalance.availableBalance),
      frozen:
        parseFloat(targetBalance.balance) -
        parseFloat(targetBalance.availableBalance),
    };
  } catch (e) {
    tradeLog.warn(`[Binance Futures] Failed to fetch balance for ${asset}`, e);
    throw e;
  }
}
