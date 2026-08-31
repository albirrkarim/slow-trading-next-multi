import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";

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
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    const result = await slowTrading.service.runSlowTradingCycle({
      bypass: parseOptionalBoolean(req.body?.bypass),
      ignoreRunnerEnabled: true,
    });

    res.status(200).json(result);
  } catch (error: any) {
    await slowTrading.notifications.notifySlowTradingOperationalError({
      source: "api.slow-trading.run",
      error,
      details: {
        method: req.method,
      },
    });

    res.status(500).json({
      error: error?.message ?? "Failed to run slow trading cycle",
    });
  }
}
