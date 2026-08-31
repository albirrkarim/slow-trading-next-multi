import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";
import blackSwan from "@/lib/trading/black-swan";

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
    if (!currentStorage.account.enabled) {
      res.status(409).json({
        error: `Account ${currentStorage.account.slug} is disabled for new entries`,
      });
      return;
    }
    const protectionState = currentStorage.modes[activeMode].blackSwan;
    if (blackSwan.state.isProtective(protectionState)) {
      res.status(423).json({
        error: `Entry blocked by Black Swan ${protectionState?.status}: ${protectionState?.reason}`,
      });
      return;
    }
    const hasOpenPosition = currentStorage.modes[activeMode].tradeSettings.some(
      (item) =>
        String(item.symbol || "").trim().toUpperCase() === symbol &&
        (item.model_memory.positions?.length ?? 0) > 0,
    );

    if (hasOpenPosition) {
      res.status(409).json({
        error: `Open position already exists for ${symbol} in ${activeMode} mode`,
      });
      return;
    }

    const result = await slowTrading.service.runSlowTradingCycle({
      account: currentStorage.account.slug,
      ignoreRunnerEnabled: true,
      forceEntrySymbols: [symbol],
    });

    const nextStorage = await slowTrading.storage.data.load({
      includeHistory: true,
    });
    const report = result.reports.find(
      (item) => String(item.symbol || "").trim().toUpperCase() === symbol,
    );
    const skippedEntrySignal = result.skippedEntrySignals.find(
      (item) => String(item.symbol || "").trim().toUpperCase() === symbol,
    );
    const wasExecuted = Boolean(
      report?.tradingDetail?.action === "BUY" ||
      nextStorage.modes[activeMode].tradeSettings.some(
        (item) =>
          String(item.symbol || "").trim().toUpperCase() === symbol &&
          (item.model_memory.positions?.length ?? 0) > 0,
      ),
    );

    res.status(200).json({
      success: true,
      executed: wasExecuted,
      message: wasExecuted
        ? (report?.message ?? `Manual entry executed for ${symbol}`)
        : (report?.message ??
          skippedEntrySignal?.reason ??
          `Manual entry for ${symbol} was skipped before order execution`),
      skippedReason: wasExecuted
        ? undefined
        : (report?.message ?? skippedEntrySignal?.reason),
      result,
      state: await slowTrading.storage.dashboard.buildStateRealtime(nextStorage),
    });
  } catch (error: any) {
    await slowTrading.notifications.notifySlowTradingOperationalError({
      source: "api.slow-trading.entry",
      error,
      details: {
        method: req.method,
        symbol: req.body?.symbol,
      },
    });

    res.status(500).json({
      error: error?.message ?? "Failed to entry slow trading position",
    });
  }
}
