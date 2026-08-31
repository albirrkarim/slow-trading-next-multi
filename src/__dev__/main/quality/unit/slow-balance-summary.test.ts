import { describe, expect, it } from "vitest";

import slowTrading from "@/lib/slowTrading";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";

// PROD:MCP_BALANCE

function dashboardState(): SlowTradingDashboardState {
  return {
    activeMode: "live",
    balances: {
      availableQuoteAsset: 100,
      lockedQuoteAsset: 40,
      reservedQuoteAsset: 25,
      safeHaven: 20,
      spendableQuoteAsset: 55,
      startingBalanceUSDT: 90,
    },
  } as SlowTradingDashboardState;
}

describe("SLOW MCP balance summary", () => {
  it("returns the canonical balance fields, formulas, and meanings", () => {
    const result = slowTrading.balanceSummary.create({
      activeMode: "live",
      dashboardState: dashboardState(),
      generatedAt: new Date("2026-08-28T00:00:00.000Z"),
      instanceName: "test-live",
      mode: "live",
    });

    expect(result.balance).toEqual({
      available: 100,
      currency: "USDT",
      locked: 40,
      reserved: 25,
      safeHaven: 20,
      spendable: 55,
      totalAsset: 140,
    });
    expect(result.equations).toEqual({
      available: "available = spendable + reserved + safeHaven",
      spendable:
        "spendable = max(0, available - reserved - safeHaven)",
      totalAsset: "totalAsset = available + locked",
    });
    expect(result.meanings.totalAsset).toContain("not floating equity");
    expect(result.meanings.locked).toContain("Do not subtract");
    expect(result).toMatchObject({
      activeMode: "live",
      generatedAt: "2026-08-28T00:00:00.000Z",
      instanceName: "test-live",
      mode: "live",
      source: "live_exchange_with_persisted_fallback",
    });
  });

  it("publishes the balance tool under the existing read permission", () => {
    const tools = slowTrading.mcp.tools.list({
      permissions: new Set(["balance.read"]),
      token: {
        createdAt: 0,
        enabled: true,
        id: "test",
        name: "test",
        permissions: ["balance.read"],
        tokenHash: "",
        tokenSecretEncrypted: "",
      },
    });
    const balanceTool = tools.find((tool) => tool.name === "slow_balance_read");

    expect(balanceTool).toBeDefined();
    expect(balanceTool?.description).toContain("plain-language meaning");
    expect(balanceTool?.description).toContain("not floating equity");
    expect(balanceTool?.annotations.readOnlyHint).toBe(true);
    expect(
      slowTrading.mcp.tools.catalog().find(
        (tool) => tool.name === "slow_balance_read",
      ),
    ).toMatchObject({ permission: "balance.read", readOnly: true });
  });
});
