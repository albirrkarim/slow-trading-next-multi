import slowTrading, {
  type SlowTradingEntryDiagnostic,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";
import binanceRequestCoordinator, {
  BinanceCooldownError,
} from "@/lib/exchange/platform/binance/request-coordinator";
import type { NextApiRequest, NextApiResponse } from "next";

interface EntryDiagnosticsResponse {
  diagnostics: SlowTradingEntryDiagnostic[];
  generatedAt: number;
}

interface EntryDiagnosticsErrorResponse {
  error: string;
  retryAt?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    EntryDiagnosticsResponse | EntryDiagnosticsErrorResponse
  >,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const activeCooldown = binanceRequestCoordinator.cooldown.get();
  if (activeCooldown) {
    res.status(503).json({
      error: "Binance cooldown",
      retryAt: activeCooldown.retryAt,
    });
    return;
  }

  try {
    const diagnostics = await slowTrading.signals.diagnostics.build();
    res.status(200).json({
      diagnostics,
      generatedAt: Date.now(),
    });
  } catch (error: any) {
    if (error instanceof BinanceCooldownError) {
      res.status(503).json({
        error: "Binance cooldown",
        retryAt: error.retryAt,
      });
      return;
    }

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
