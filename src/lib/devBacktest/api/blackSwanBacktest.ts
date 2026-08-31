import { isDevBacktestEnabled } from "@/lib/env/devBacktest";
import blackSwan from "@/lib/trading/black-swan";
import type { NextApiRequest, NextApiResponse } from "next";
import blackSwanBacktest, { type BlackSwanBacktestInput } from "../black-swan";

export default async function blackSwanBacktestHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isDevBacktestEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    const body = (req.body ?? {}) as Partial<BlackSwanBacktestInput>;
    const result = await blackSwanBacktest.run({
      symbols: Array.isArray(body.symbols) ? body.symbols : ["BTC"],
      startTime: Number(body.startTime),
      endTime: Number(body.endTime),
      config: blackSwan.config.normalize(body.config),
      useCache: body.useCache !== false,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Backtest failed",
    });
  }
}
