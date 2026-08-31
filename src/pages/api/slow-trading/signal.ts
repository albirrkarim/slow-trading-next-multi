import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";
import { FILES } from "@/components/storage";
import md5 from "md5";
import fs from "fs-extra";
import path from "path";
import { tradeLog } from "@/lib/trading/helper/log";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }

  return undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    const params = req.method === "GET" ? req.query : req.body;

    const cachePath = `${FILES.slow.getCachePrefix("signal")}${md5(JSON.stringify({ params }))}.json`;

    await fs.ensureDir(path.dirname(cachePath));

    if ((await fs.exists(cachePath)) && !params?.bypass) {
      const output = await fs.readJson(cachePath);
      res.json(output);
      return;
    }

    const result = await slowTrading.signals.buildSlowTradingSignals({
      bypass: parseOptionalBoolean(params?.bypass),
    });

    const output = {
      activeMode: result.activeMode,
      entrySignals: result.entrySignals,
    };

    await fs.writeJson(cachePath, output);

    res.status(200).json(output);
  } catch (error: any) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.signal",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write signal error log",
          logError,
        );
      });
    res.status(500).json({
      error: error?.message ?? "Failed to generate slow trading signals",
    });
  }
}
