import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";
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

  try {
    // PROD:BINANCE_MANUAL_COOLDOWN_RESET
    const health = await slowTrading.binanceHealth.reset();
    res.status(200).json(health);
  } catch (error) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.binance-cooldown-reset",
        error,
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write Binance cooldown reset error log",
          logError,
        );
      });
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to reset Binance cooldown",
    });
  }
}
