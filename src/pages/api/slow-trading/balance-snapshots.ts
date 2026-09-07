import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const requestedModeRaw = req.query.mode;
    const requestedMode = Array.isArray(requestedModeRaw)
      ? requestedModeRaw[0]
      : requestedModeRaw;
    const storage = await slowTrading.storage.data.load({ modeScope: "active" });
    const resolvedMode =
      requestedMode === "sandbox" || requestedMode === "live"
        ? requestedMode
        : slowTrading.storage.mode.getActive(storage);
    const enabledAccounts = storage.runtime.exchangeAccounts
      .filter((account) => account.enabled)
      .map((account) => account.slug);
    const snapshots =
      await slowTrading.storage.balanceSnapshots.readCombined({
        accounts: enabledAccounts,
        mode: resolvedMode,
      });

    return res.status(200).json(snapshots);
  } catch (error: any) {
    tradeLog.error("[slow-trading] Failed to read balance snapshots", error);
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.balance-snapshots",
      error,
      details: {
        method: req.method,
        mode: req.query.mode,
      },
    }).catch((logError) => {
      tradeLog.error(
        "[slow-trading] failed to write balance snapshots error log",
        logError,
      );
    });
    return res.status(500).json({ error: error.message ?? "Unknown error" });
  }
}
