import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";
import type {
  SlowTradingErrorLogEntry,
  SlowTradingErrorStatus,
  SlowTradingLogKind,
  SlowTradingLogs,
  SlowTradingManagementLogEntry,
  SlowTradingSafeHavenLogEntry,
  SlowTradingWithdrawalLogEntry,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

type SlowTradingLogResponse =
  | SlowTradingLogs
  | SlowTradingErrorLogEntry[]
  | SlowTradingManagementLogEntry[]
  | SlowTradingSafeHavenLogEntry[]
  | SlowTradingWithdrawalLogEntry[]
  | { cleared: number; kind: SlowTradingLogKind }
  | { deleted: boolean; id: string; kind: SlowTradingLogKind }
  | { updated: SlowTradingErrorLogEntry[] }
  | { error: string };

function parseKind(value: unknown): SlowTradingLogKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "errors" ||
    raw === "management" ||
    raw === "safe_haven" ||
    raw === "withdrawals"
  ) {
    return raw;
  }

  return null;
}

function parseErrorStatus(value: unknown): SlowTradingErrorStatus | null {
  return value === "new" || value === "dismissed" || value === "solved"
    ? value
    : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SlowTradingLogResponse>,
) {
  try {
    if (
      req.method !== "GET" &&
      req.method !== "DELETE" &&
      req.method !== "PATCH"
    ) {
      res.setHeader("Allow", ["GET", "DELETE", "PATCH"]);
      res.status(405).json({ error: `Method ${req.method} Not Allowed` });
      return;
    }

    const kind = parseKind(req.query.kind);

    if (req.method === "PATCH") {
      const ids: string[] = Array.isArray(req.body?.ids)
        ? Array.from<string>(
            new Set<string>(
              (req.body.ids as unknown[])
                .filter((id): id is string => typeof id === "string")
                .map((id) => id.trim())
                .filter(Boolean),
            ),
          )
        : [];
      const status = parseErrorStatus(req.body?.status);

      if (kind !== "errors") {
        res.status(400).json({ error: "Only error logs support status updates." });
        return;
      }
      if (ids.length === 0 || !status) {
        res.status(400).json({ error: "Error log ids and status are required." });
        return;
      }

      const result = await slowTrading.storage.logs.updateErrorStatuses(
        ids,
        status,
      );
      if (result.missingIds.length > 0) {
        res.status(404).json({
          error: `Error logs not found: ${result.missingIds.join(", ")}`,
        });
        return;
      }
      res.status(200).json({ updated: result.updated });
      return;
    }

    if (req.method === "DELETE") {
      const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
      const id = String(rawId ?? "").trim();
      const clearAll = req.query.all === "true";

      if (!kind) {
        res.status(400).json({ error: "Log kind is required." });
        return;
      }

      if (clearAll) {
        const cleared = await slowTrading.storage.logs.clearEntries(kind);
        res.status(200).json({ cleared, kind });
        return;
      }

      if (!id) {
        res.status(400).json({ error: "Log id is required." });
        return;
      }

      const deleted = await slowTrading.storage.logs.deleteEntry(kind, id);
      if (!deleted) {
        res.status(404).json({ error: "Log record was not found." });
        return;
      }

      res.status(200).json({ deleted, id, kind });
      return;
    }

    const logs = await slowTrading.storage.logs.load();

    if (kind === "errors") {
      res.status(200).json(logs.errors);
      return;
    }

    if (kind === "management") {
      res.status(200).json(logs.management);
      return;
    }

    if (kind === "safe_haven") {
      res.status(200).json(logs.safeHaven);
      return;
    }

    if (kind === "withdrawals") {
      res.status(200).json(logs.withdrawals);
      return;
    }

    res.status(200).json(logs);
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.logs",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write logs error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to load slow trading logs",
    });
  }
}
