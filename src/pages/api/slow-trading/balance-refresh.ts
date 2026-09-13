import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";
import binanceRequestCoordinator from "@/lib/exchange/platform/binance/request-coordinator";
import { tradeLog } from "@/lib/trading/helper/log";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const account = String(req.body?.account ?? "").trim();
  if (!account) {
    res.status(400).json({ error: "Account is required" });
    return;
  }

  try {
    // PROD:MANUAL_ACCOUNT_BALANCE_REFRESH
    const result = await slowTrading.balance.live.refreshAccount(account);
    res.status(200).json(result);
  } catch (error) {
    const rateLimited =
      binanceRequestCoordinator.error.isRateLimit(error);
    if (!rateLimited) {
      await slowTrading.storage.logs.appendError({
        source: "slow-trading.dashboard.manual-balance-refresh",
        error,
        details: { account },
      }).catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write manual balance refresh error log",
          logError,
        );
      });
    }

    res.status(rateLimited ? 429 : 500).json({
      error:
        error instanceof Error
          ? error.message
          : `Failed to refresh live balance for ${account}`,
    });
  }
}
