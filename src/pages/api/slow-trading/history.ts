import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading, { type SlowTradingMode } from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

function parseMode(value: unknown): SlowTradingMode | null {
  return value === "live" || value === "sandbox" ? value : null;
}

async function loadCombinedDashboardState() {
  const catalog = await slowTrading.storage.data.load({ modeScope: "active" });
  const storages = [];
  for (const account of catalog.runtime.exchangeAccounts) {
    storages.push(
      await slowTrading.storage.data.load({
        account: account.slug,
        includeHistory: true,
      }),
    );
  }
  return slowTrading.storage.dashboard.buildCombinedStateRealtime(storages);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "DELETE" && req.method !== "PATCH") {
      res.setHeader("Allow", ["DELETE", "PATCH"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    const mode = parseMode(req.body?.mode);
    if (!mode) {
      res.status(400).json({ error: "Valid mode is required" });
      return;
    }

    if (req.method === "DELETE" && req.body?.clearAll === true) {
      const { deletedCount } = await slowTrading.storage.history.clear(mode);
      res.status(200).json({
        success: true,
        deletedCount,
        state: await loadCombinedDashboardState(),
      });
      return;
    }

    const symbol = String(req.body?.symbol || "").trim().toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "Symbol is required" });
      return;
    }

    const identity = {
      account: String(req.body?.account || "").trim(),
      mode,
      symbol,
      entryId:
        typeof req.body?.entryId === "string" ? req.body.entryId : undefined,
      entryTime:
        typeof req.body?.entryTime === "number"
          ? req.body.entryTime
          : undefined,
      exitTime:
        typeof req.body?.exitTime === "number" ? req.body.exitTime : undefined,
      quantity:
        typeof req.body?.quantity === "number" ? req.body.quantity : undefined,
      usdt: typeof req.body?.usdt === "number" ? req.body.usdt : undefined,
    };
    if (!identity.account) {
      res.status(400).json({ error: "Account is required" });
      return;
    }

    if (req.method === "PATCH") {
      if (typeof req.body?.notes !== "string") {
        res.status(400).json({ error: "Notes must be a string" });
        return;
      }

      const { updated } =
        await slowTrading.storage.history.updateNotes({
          ...identity,
          notes: req.body.notes,
        });

      if (!updated) {
        res.status(404).json({ error: `Trade history row not found for ${symbol}` });
        return;
      }

      res.status(200).json({
        success: true,
        state: await loadCombinedDashboardState(),
      });
      return;
    }

    const { deleted } =
      await slowTrading.storage.history.deleteEntry(identity);

    if (!deleted) {
      res.status(404).json({ error: `Trade history row not found for ${symbol}` });
      return;
    }

    res.status(200).json({
      success: true,
      deletedCount: 1,
      state: await loadCombinedDashboardState(),
    });
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.history",
      error,
      details: {
        method: req.method,
        mode: req.body?.mode,
        symbol: req.body?.symbol,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write history error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to update slow trading history",
    });
  }
}
