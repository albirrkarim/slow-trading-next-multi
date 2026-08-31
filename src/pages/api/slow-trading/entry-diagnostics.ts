import slowTrading, {
  type SlowTradingEntryDiagnostic,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";
import type { NextApiRequest, NextApiResponse } from "next";

interface EntryDiagnosticsResponse {
  diagnostics: SlowTradingEntryDiagnostic[];
  generatedAt: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EntryDiagnosticsResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const diagnostics = await slowTrading.signals.diagnostics.build();
    res.status(200).json({
      diagnostics,
      generatedAt: Date.now(),
    });
  } catch (error: any) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.entry-diagnostics",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write entry diagnostics error log",
          logError,
        );
      });
    res.status(500).json({
      error: error?.message ?? "Failed to build entry diagnostics",
    });
  }
}
