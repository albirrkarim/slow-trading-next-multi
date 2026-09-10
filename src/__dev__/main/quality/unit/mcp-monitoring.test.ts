import { afterEach, describe, expect, it, vi } from "vitest";

import slowTradingMcp from "@/lib/slowTrading/mcp";
import slowTradingMcpMonitoring from "@/lib/slowTrading/mcp/monitoring";
import slowTradingStorage from "@/lib/slowTrading/storage";

describe("SLOW MCP monitoring snapshot", () => {
  afterEach(() => vi.restoreAllMocks());

  // PROD:MCP_MONITORING_SNAPSHOT
  // PROD:MCP_MONITORING_CREDENTIAL_REDACTION
  // PROD:MCP_MONITORING_EFFECTIVE_CONFIG
  it("normalizes every account and omits credentials from config, automation, and logs", async () => {
    const storage = slowTradingStorage.data.createDefault();
    const account = storage.runtime.exchangeAccounts[0]!;
    account.credentials.apiKey = "secret-api-key";
    account.credentials.apiSecret = "secret-api-secret";
    storage.sharedConfig.name = "Seasonal Trade";
    storage.sharedConfig.description = "Short-term strategy";
    storage.runtime.withdrawal.schedules.push({
      id: "withdraw-monthly",
      account: account.slug,
      name: "Monthly",
      enabled: true,
      amountUSDT: 25,
      dayOfMonth: 10,
      targetNetwork: "BSC",
      targetWalletAddress: "wallet-address",
    });

    vi.spyOn(slowTradingStorage.data, "load").mockResolvedValue(storage);
    vi.spyOn(slowTradingStorage.logs, "load").mockResolvedValue({
      errors: [{
        id: "error-1",
        createdAt: 1,
        source: "test",
        status: "new",
        message: "failed with secret-api-key",
        stack: "secret stack",
        details: { apiSecret: "secret-api-secret" },
      }],
      management: [],
      safeHaven: [],
      withdrawals: [],
    });

    const result = await slowTradingMcpMonitoring.read(
      { include: ["config", "automation", "logs"] },
      "test-instance",
    );
    const serialized = JSON.stringify(result);

    expect(result.instance).toMatchObject({
      appName: "test-instance",
      profileName: "Seasonal Trade",
      accountModel: "multi",
    });
    expect(result.accounts[0]).toMatchObject({
      id: account.slug,
      credentialStatus: { configured: true },
    });
    expect(result.config?.effectiveByAccount[account.slug]).toBeDefined();
    expect(result.automation?.withdrawals.schedules[0]).toMatchObject({
      accountId: account.slug,
      amountUSDT: 25,
    });
    expect(result.logs?.errors[0]?.message).toContain("[REDACTED]");
    expect(serialized).not.toContain("secret-api-key");
    expect(serialized).not.toContain("secret-api-secret");
    expect(serialized).not.toContain("secret stack");
    expect(result.logs?.errors[0]).not.toHaveProperty("details");
    expect(result.logs?.errors[0]).not.toHaveProperty("stack");
  });
  // PROD:MCP_MONITORING_SECTION_FAILURE
  it("reports unavailable optional logs as a partial snapshot", async () => {
    vi.spyOn(slowTradingStorage.data, "load").mockResolvedValue(slowTradingStorage.data.createDefault());
    vi.spyOn(slowTradingStorage.logs, "load").mockRejectedValue(new Error("private failure"));
    const result = await slowTradingMcpMonitoring.read({ include: ["logs"] }, "multi");
    expect(result).toMatchObject({ status: "partial", issues: [{ section: "logs", code: "logs_unavailable" }] });
    expect(result).not.toHaveProperty("logs");
  });

  it("publishes the snapshot as a read-only monitoring tool", () => {
    expect(
      slowTradingMcp.tools.catalog().find(
        (tool) => tool.name === "slow_monitoring_snapshot_read",
      ),
    ).toMatchObject({ permission: "monitoring.read", readOnly: true });
  });
});
