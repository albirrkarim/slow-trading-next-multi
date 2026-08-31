import type { NextApiRequest, NextApiResponse } from "next";

import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function getBearerToken(req: NextApiRequest) {
  const pathToken = req.query.token;
  if (typeof pathToken === "string" && pathToken.trim()) {
    return pathToken.trim();
  }

  const authorization = req.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerToken = req.headers["x-mcp-token"];
  return typeof headerToken === "string" ? headerToken.trim() : "";
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}

function isNotification(request: JsonRpcRequest) {
  return !Object.hasOwn(request, "id");
}

function buildToolCallResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

async function handleMcpRequest(
  request: JsonRpcRequest,
  auth: NonNullable<Awaited<ReturnType<typeof slowTrading.mcp.tokens.authenticate>>>,
) {
  if (!request || typeof request !== "object" || !request.method) {
    return jsonRpcError(request?.id, -32600, "Invalid JSON-RPC request");
  }

  if (isNotification(request)) {
    return null;
  }

  if (request.method === "initialize") {
    const appName = slowTrading.mcp.identity.getAppName();
    return jsonRpcResult(request.id, {
      protocolVersion:
        String(request.params?.protocolVersion ?? "").trim() || "2024-11-05",
      capabilities: {
        tools: {},
      },
      instructions: slowTrading.mcp.identity.getInstructions(),
      appName,
      serverInfo: {
        name: slowTrading.mcp.identity.getServerName(),
        version: "0.1.0",
        appName,
      },
    });
  }

  if (request.method === "ping") {
    return jsonRpcResult(request.id, {});
  }

  if (request.method === "tools/list") {
    return jsonRpcResult(request.id, {
      tools: slowTrading.mcp.tools.list(auth),
    });
  }

  if (request.method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args =
      request.params?.arguments && typeof request.params.arguments === "object"
        ? (request.params.arguments as Record<string, unknown>)
        : {};
    const payload = await slowTrading.mcp.tools.call({
      auth,
      name,
      arguments: args,
    });
    return jsonRpcResult(request.id, buildToolCallResult(payload));
  }

  if (request.method === "resources/list") {
    return jsonRpcResult(request.id, { resources: [] });
  }

  if (request.method === "prompts/list") {
    return jsonRpcResult(request.id, { prompts: [] });
  }

  return jsonRpcError(request.id, -32601, `Method not found: ${request.method}`);
}

export default async function mcpHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const appName = slowTrading.mcp.identity.getAppName();
    res.status(200).json({
      name: `slow-trading-next MCP (${appName})`,
      appName,
      endpoint: req.query.token ? "/api/mcp/[token]" : "/api/mcp",
      transport: "streamable-http-json-rpc",
      authentication: req.query.token ? "Path token" : "Bearer token",
    });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }

  const rawToken = getBearerToken(req);
  const auth = rawToken
    ? await slowTrading.mcp.tokens.authenticate(rawToken)
    : null;
  if (!auth) {
    res.status(401).json({
      error: "MCP token is required or invalid",
    });
    return;
  }

  try {
    const body = req.body;
    const requests = Array.isArray(body) ? body : [body];
    const responses = (
      await Promise.all(
        requests.map((request) =>
          handleMcpRequest(request as JsonRpcRequest, auth).catch((error) =>
            jsonRpcError(
              (request as JsonRpcRequest)?.id,
              -32603,
              error instanceof Error ? error.message : "MCP tool failed",
            ),
          ),
        ),
      )
    ).filter(Boolean);

    if (responses.length === 0) {
      res.status(202).end();
      return;
    }

    res.status(200).json(Array.isArray(body) ? responses : responses[0]);
  } catch (error: any) {
    await slowTrading.storage.logs.appendError({
      source: "api.mcp",
      error,
      details: {
        method: req.method,
      },
    }).catch((logError) => {
      tradeLog.error("[slow-trading] failed to write MCP error log", logError);
    });
    res.status(500).json({
      error: error?.message ?? "Failed to handle MCP request",
    });
  }
}
