import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading, {
  type SlowTradingManualQueueCreateInput,
  type SlowTradingQueueItem,
  type SlowTradingQueues,
} from "@/lib/slowTrading";
import type { SlowTradingQueueKind } from "@/lib/slowTrading/queue";
import { tradeLog } from "@/lib/trading/helper/log";

type SlowTradingQueueResponse =
  | SlowTradingQueues
  | SlowTradingQueueItem
  | { deleted: boolean; id: string; kind: SlowTradingQueueKind }
  | { error: string };

/** Parses the dashboard queue discriminator. */
function parseQueueKind(value: unknown): SlowTradingQueueKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "safe_haven" || raw === "withdrawal") {
    return raw;
  }

  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SlowTradingQueueResponse>,
) {
  try {
    if (req.method === "GET") {
      res.status(200).json(await slowTrading.queue.items.load());
      return;
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as Partial<SlowTradingManualQueueCreateInput>;

      if (body.kind === "safe_haven") {
        const item = await slowTrading.queue.items.createManual({
          kind: "safe_haven",
          amountUSDT: Number(body.amountUSDT),
        });
        res.status(201).json(item);
        return;
      }

      if (body.kind === "withdrawal") {
        const item = await slowTrading.queue.items.createManual({
          kind: "withdrawal",
          scheduleId: String(body.scheduleId ?? "").trim(),
        });
        res.status(201).json(item);
        return;
      }

      res.status(400).json({ error: "Queue kind is required." });
      return;
    }

    if (req.method === "DELETE") {
      const kind = parseQueueKind(req.query.kind);
      const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
      const id = String(rawId ?? "").trim();

      if (!kind) {
        res.status(400).json({ error: "Queue kind is required." });
        return;
      }

      if (!id) {
        res.status(400).json({ error: "Queue id is required." });
        return;
      }

      const deleted = await slowTrading.queue.items.cancel(kind, id);
      if (!deleted) {
        res.status(404).json({ error: "Queue item was not found." });
        return;
      }

      res.status(200).json({ deleted, id, kind });
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.queue",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write queue API error log",
          logError,
        );
      });
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to handle slow trading queue.",
    });
  }
}
