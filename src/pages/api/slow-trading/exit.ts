import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";

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

    const symbol = String(req.body?.symbol || "").trim().toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "Symbol is required" });
      return;
    }

    const currentStorage = await slowTrading.storage.data.load({
      account: String(req.body?.account || "").trim() || undefined,
      modeScope: "active",
    });
    const activeMode = currentStorage.runtime.sandboxEnabled ? "sandbox" : "live";
    const hasOpenPosition = currentStorage.modes[activeMode].tradeSettings.some(
      (item) =>
        String(item.symbol || "").trim().toUpperCase() === symbol &&
        (item.model_memory.positions?.length ?? 0) > 0,
    );

    if (!hasOpenPosition) {
      res.status(404).json({
        error: `No open position found for ${symbol} in ${activeMode} mode`,
      });
      return;
    }

    const result = await slowTrading.service.runSlowTradingCycle({
      account: currentStorage.account.slug,
      ignoreRunnerEnabled: true,
      forceExitSymbols: [symbol],
      disableAutoEntry: true,
    });

    const nextStorage = await slowTrading.storage.data.load({
      includeHistory: true,
    });

    res.status(200).json({
      success: true,
      result,
      state: await slowTrading.storage.dashboard.buildStateRealtime(nextStorage),
    });
  } catch (error: any) {
    await slowTrading.notifications.notifySlowTradingOperationalError({
      source: "api.slow-trading.exit",
      error,
      details: {
        method: req.method,
        symbol: req.body?.symbol,
      },
    });

    res.status(500).json({
      error: error?.message ?? "Failed to exit slow trading position",
    });
  }
}
