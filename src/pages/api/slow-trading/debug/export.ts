import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    // PROD:SYNC_ONLINE_TO_LOCAL
    const bundle = await slowTrading.debugSync.exportPersistentStorageBundle();
    res.status(200).json(bundle);
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.debug.export",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write debug export error log", logError);
    });

    res.status(500).json({
      error: error?.message ?? "Failed to export persistent storage",
    });
  }
}
