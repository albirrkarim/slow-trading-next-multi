import type { NextApiRequest, NextApiResponse } from "next";

import { coinMetadataSync } from "@/lib/devBacktest/coins/tag-sync";
import coinTags from "@/lib/devBacktest/coins/tags";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    const host = req.headers.host;
    if (!slowTrading.debugSync.isLocalCoinMetadataManualSyncAllowed(host)) {
      res.status(403).json({
        error:
          "Coin metadata broadcast is only allowed when APP_NAME=localhost on localhost outside Railway.",
      });
      return;
    }

    const state = coinTags.list();
    const results = await coinMetadataSync.broadcastToPeers(
      state,
      coinMetadataSync.manualPeers,
    );
    const failed = results.filter((result) => !result.success);

    res.status(200).json({
      failed,
      results,
      state,
      succeeded: results.filter((result) => result.success),
    });
  } catch (error: any) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.debug.broadcast-coin-metadata",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write coin metadata broadcast error log",
          logError,
        );
      });

    res.status(500).json({
      error: error?.message ?? "Failed to broadcast coin metadata",
    });
  }
}
