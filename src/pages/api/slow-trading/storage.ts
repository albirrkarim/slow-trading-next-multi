import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading, {
  type SlowTradingStorageUpdateInput,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

async function loadDashboardState() {
  const catalog = await slowTrading.storage.data.load({ modeScope: "active" });
  const orderedAccounts = [
    catalog.account,
    ...catalog.runtime.exchangeAccounts.filter(
      (accountItem) => accountItem.slug !== catalog.account.slug,
    ),
  ];
  const storages = [];
  for (const accountItem of orderedAccounts) {
    storages.push(
      await slowTrading.storage.data.load({
        account: accountItem.slug,
        includeHistory: true,
      }),
    );
  }
  const combined =
    await slowTrading.storage.dashboard.buildCombinedStateRealtime(storages);
  return combined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Ensure the background slow-trading runner singleton is initialized
    // whenever the dashboard storage endpoint is used.
    await slowTrading.runner.get();

    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(await loadDashboardState());
      return;
    }

    if (req.method === "PUT") {
      const body = (req.body ?? {}) as SlowTradingStorageUpdateInput;
      const previousStorage = await slowTrading.storage.data.load({
        modeScope: "active",
      });
      await slowTrading.storage.data.update({
        config: body.config,
        ...body,
        sandboxInitialBalanceUSDT:
          typeof body.sandboxInitialBalanceUSDT === "number"
            ? body.sandboxInitialBalanceUSDT
            : undefined,
        symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      });
      const storage = await slowTrading.storage.data.load({
        includeHistory: true,
      });
      const managementSource = Array.isArray(body.symbols)
        ? "dashboard.coin-management"
        : "dashboard.settings.coin-management";
      const managementActions = slowTrading.notifications.managementAction.build(
        {
          previousSymbols: previousStorage.config.symbols,
          nextSymbols: storage.config.symbols,
          reason: "Configured Symbols list was updated through the dashboard storage API.",
          source: managementSource,
        },
      );

      if (managementActions.length > 0) {
        await Promise.all(
          managementActions.map((action) =>
            slowTrading.storage.logs.appendManagement({
              action: action.action,
              reason: action.reason,
              source: action.source,
              symbol: action.symbol,
              timestamp: action.t,
            }),
          ),
        ).catch((logError) => {
          tradeLog.error(
            "[slow-trading] failed to persist management-action log",
            logError,
          );
        });

        await slowTrading.notifications.managementAction
          .notify({
            actions: managementActions,
            notification: storage.runtime.notification,
          })
          .catch((notificationError) => {
            tradeLog.error(
              "[slow-trading] failed to send management-action notification",
              notificationError,
            );
          });
      }

      res.status(200).json(await loadDashboardState());
      return;
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.storage",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write storage error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to handle slow trading storage",
    });
  }
}
