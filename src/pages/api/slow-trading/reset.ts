import type { NextApiRequest, NextApiResponse } from "next";
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

    const initialBalance =
      typeof req.body?.sandboxInitialBalanceUSDT === "number"
        ? req.body.sandboxInitialBalanceUSDT
        : undefined;
    const nextStorage = await slowTrading.storage.data.resetSandbox({
      sandboxInitialBalanceUSDT: initialBalance,
    });
    res
      .status(200)
      .json(await slowTrading.storage.dashboard.buildStateRealtime(nextStorage));
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.reset",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write reset error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to reset sandbox state",
    });
  }
}
