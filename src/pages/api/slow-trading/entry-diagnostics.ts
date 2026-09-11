import slowTrading, {
  type SlowTradingAccountEntryDiagnostics,
  type SlowTradingEntryDiagnosticsSnapshot,
  type SlowTradingSharedEntryGuardDiagnostic,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";
import binanceRequestCoordinator, {
  BinanceCooldownError,
} from "@/lib/exchange/platform/binance/request-coordinator";
import type { NextApiRequest, NextApiResponse } from "next";

interface EntryDiagnosticsErrorResponse {
  error: string;
  retryAt?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    SlowTradingEntryDiagnosticsSnapshot | EntryDiagnosticsErrorResponse
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
    const catalog = await slowTrading.storage.data.load({
      modeScope: "active",
    });
    const enabledAccounts = catalog.runtime.exchangeAccounts.filter(
      (account) => account.enabled,
    );
    const logs = await slowTrading.storage.logs.load();
    const sharedGuards: SlowTradingSharedEntryGuardDiagnostic[] = [
      {
        code: "RUNNER_ENABLED",
        reason: catalog.runtime.runnerEnabled
          ? "The SLOW runner is enabled."
          : "The SLOW runner is disabled.",
        status: catalog.runtime.runnerEnabled ? "ready" : "blocked",
      },
      {
        code: "AUTO_ENTRY_ENABLED",
        reason: catalog.runtime.autoEntryEnabled
          ? "Automatic entry is enabled."
          : "Automatic entry is disabled.",
        status: catalog.runtime.autoEntryEnabled ? "ready" : "blocked",
      },
    ];
    const accounts: SlowTradingAccountEntryDiagnostics[] = [];

    for (const account of enabledAccounts) {
      const latestExecutionError = logs.errors.find(
        (entry) =>
          entry.status === "new" &&
          entry.source === `cycle.account.${account.slug}`,
      );

      try {
        const storage = await slowTrading.storage.data.load({
          account: account.slug,
          modeScope: "active",
        });
        accounts.push({
          account: { name: account.name, slug: account.slug },
          diagnostics: await slowTrading.signals.diagnostics.build({ storage }),
          ...(latestExecutionError && {
            latestExecutionError: {
              createdAt: latestExecutionError.createdAt,
              id: latestExecutionError.id,
              message: latestExecutionError.message,
            },
          }),
        });
      } catch (accountError: any) {
        accounts.push({
          account: { name: account.name, slug: account.slug },
          diagnosticError:
            accountError?.message ?? "Could not evaluate this account.",
          diagnostics: [],
          ...(latestExecutionError && {
            latestExecutionError: {
              createdAt: latestExecutionError.createdAt,
              id: latestExecutionError.id,
              message: latestExecutionError.message,
            },
          }),
        });
      }
    }

    res.status(200).json({
      accounts,
      generatedAt: Date.now(),
      sharedGuards,
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
