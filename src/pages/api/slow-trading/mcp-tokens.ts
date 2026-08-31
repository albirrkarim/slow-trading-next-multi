import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading, {
  SLOW_TRADING_MCP_PERMISSIONS,
  type SlowTradingMcpPermission,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

function normalizePermissions(value: unknown): SlowTradingMcpPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(SLOW_TRADING_MCP_PERMISSIONS);
  return Array.from(
    new Set(
      value
        .map((permission) => String(permission))
        .filter((permission): permission is SlowTradingMcpPermission =>
          allowed.has(permission),
        ),
    ),
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      res.status(200).json({
        permissions: SLOW_TRADING_MCP_PERMISSIONS,
        tools: slowTrading.mcp.tools.catalog(),
        tokens: await slowTrading.mcp.tokens.list(),
      });
      return;
    }

    if (req.method === "POST") {
      if (req.body?.action === "reveal") {
        const token = await slowTrading.mcp.tokens.reveal(
          String(req.body?.id ?? ""),
        );
        res.status(200).json({ token });
        return;
      }

      const created = await slowTrading.mcp.tokens.create({
        name: String(req.body?.name ?? "MCP token"),
        permissions: normalizePermissions(req.body?.permissions),
      });
      res.status(201).json(created);
      return;
    }

    if (req.method === "PATCH") {
      const tokens = await slowTrading.mcp.tokens.update({
        id: String(req.body?.id ?? ""),
        name:
          typeof req.body?.name === "string" ? String(req.body.name) : undefined,
        enabled:
          typeof req.body?.enabled === "boolean"
            ? req.body.enabled
            : undefined,
        permissions: Object.hasOwn(req.body ?? {}, "permissions")
          ? normalizePermissions(req.body?.permissions)
          : undefined,
      });
      res.status(200).json({ tokens });
      return;
    }

    if (req.method === "DELETE") {
      const tokens = await slowTrading.mcp.tokens.delete(
        String(req.body?.id ?? req.query.id ?? ""),
      );
      res.status(200).json({ tokens });
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.slow-trading.mcp-tokens",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write MCP token error log", logError);
    });
    res.status(400).json({
      error: error?.message ?? "Failed to handle MCP tokens",
    });
  }
}
