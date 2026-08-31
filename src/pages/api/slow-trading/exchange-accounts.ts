import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";
import { normalizeExchangeAccountId } from "@/lib/slowTrading/storage/account";
import { tradeLog } from "@/lib/trading/helper/log";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await slowTrading.runner.get();

    if (req.method === "GET") {
      const accounts = await slowTrading.storage.account.loadAccounts();
      const storage = await slowTrading.storage.data.load();
      res.status(200).json({
        accounts,
        exchangeAccountId: storage.runtime.exchangeAccountId,
      });
      return;
    }

    if (req.method === "PUT") {
      const body = (req.body ?? {}) as {
        accounts?: unknown;
        exchangeAccountId?: unknown;
      };
      const accounts = await slowTrading.storage.account.saveAccounts(
        body.accounts,
      );
      const storage = await slowTrading.storage.data.load();
      const requestedAccountId =
        body.exchangeAccountId !== undefined
          ? normalizeExchangeAccountId(body.exchangeAccountId)
          : storage.runtime.exchangeAccountId;
      const accountExists = accounts.some(
        (account) => account.id === requestedAccountId,
      );
      const exchangeAccountId = accountExists
        ? requestedAccountId
        : (accounts[0]?.id ?? storage.runtime.exchangeAccountId);

      if (exchangeAccountId !== storage.runtime.exchangeAccountId) {
        await slowTrading.storage.data.update({ exchangeAccountId });
      }

      res.status(200).json({
        accounts,
        exchangeAccountId,
      });
      return;
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.exchange-accounts",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write exchange account error log",
          logError,
        );
      });
    res.status(500).json({
      error: error?.message ?? "Failed to handle exchange accounts",
    });
  }
}
