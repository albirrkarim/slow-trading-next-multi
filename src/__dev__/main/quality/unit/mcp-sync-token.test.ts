import { afterEach, describe, expect, it, vi } from "vitest";

import slowTradingMcp from "@/lib/slowTrading/mcp";
import { SLOW_TRADING_MCP_PERMISSIONS } from "@/lib/slowTrading/types";

// PROD:MCP_SYNC_TOKEN_SUPER_USER

describe("SLOW MCP SYNC_TOKEN authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates without persisted token storage and grants every permission", async () => {
    vi.stubEnv("SYNC_TOKEN", "shared-server-secret");

    const auth = await slowTradingMcp.tokens.authenticate("shared-server-secret");

    expect(auth?.token).toMatchObject({
      id: "sync-token-super-user",
      name: "SYNC_TOKEN super user",
      enabled: true,
    });
    expect([...auth!.permissions]).toEqual([...SLOW_TRADING_MCP_PERMISSIONS]);
  });
});

