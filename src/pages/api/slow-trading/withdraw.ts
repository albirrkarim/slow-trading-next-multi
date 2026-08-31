import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading, {
  type SlowTradingWithdrawalExecutionResult,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

type WithdrawRequestBody = {
  scheduleId?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SlowTradingWithdrawalExecutionResult | { error: string }>,
) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      res.status(405).json({ error: `Method ${req.method} Not Allowed` });
      return;
    }

    const body = (req.body ?? {}) as WithdrawRequestBody;
    const scheduleId = String(body.scheduleId ?? "").trim();
    if (!scheduleId) {
      res.status(400).json({ error: "Please choose which withdrawal schedule to run." });
      return;
    }

    const result = await slowTrading.withdrawal.schedules.execute({
      scheduleId,
    });
    res.status(200).json(result);
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.withdraw",
      error,
      details: {
        method: req.method,
        scheduleId: req.body?.scheduleId,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write withdrawal error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to try slow trading withdraw flow",
    });
  }
}
