import slowTradingStorage from "../storage";
import type {
  SlowTradingLogs,
  SlowTradingMode,
  SlowTradingStorageData,
} from "../types";

type MonitoringSection = "config" | "automation" | "logs";

export interface SlowMonitoringSnapshotInput {
  mode?: "active" | SlowTradingMode;
  include?: MonitoringSection[];
  logLimit?: number;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function iso(timestamp?: number): string | null {
  return timestamp && Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function requestedSections(value: unknown): Set<MonitoringSection> {
  if (!Array.isArray(value)) return new Set(["config", "automation"]);
  return new Set(
    value.filter(
      (item): item is MonitoringSection =>
        item === "config" || item === "automation" || item === "logs",
    ),
  );
}

function secretValues(storage: SlowTradingStorageData): string[] {
  return storage.runtime.exchangeAccounts.flatMap((account) =>
    Object.values(account.credentials).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
}

function scrubText(value: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (result, secret) => result.split(secret).join("[REDACTED]"),
    value,
  );
}

function boundedLogs(
  logs: SlowTradingLogs,
  limit: number,
  secrets: readonly string[],
) {
  return {
    binanceCooldowns: (logs.binanceCooldowns ?? []).slice(0, limit).map((entry) => ({
      id: entry.id,
      startAt: iso(entry.t),
      endAt: iso(entry.end),
      endpoint: entry.endpoint,
      kind: entry.kind,
      occurrences: entry.occurrences,
      code: entry.code ?? null,
      httpStatus: entry.status ?? null,
      reason: scrubText(entry.reason, secrets),
    })),
    errors: logs.errors.slice(0, limit).map((entry) => ({
      id: entry.id,
      createdAt: iso(entry.createdAt),
      source: entry.source,
      status: entry.status,
      message: scrubText(entry.message, secrets),
    })),
    management: logs.management.slice(0, limit).map((entry) => ({
      id: entry.id,
      createdAt: iso(entry.createdAt),
      action: entry.action,
      symbol: entry.symbol,
      source: entry.source,
      reason: scrubText(entry.reason, secrets),
    })),
    safeHaven: logs.safeHaven.slice(0, limit).map((entry) => ({
      id: entry.id,
      accountId: entry.account,
      createdAt: iso(entry.createdAt),
      mode: entry.mode,
      previousUSDT: entry.previousUSDT,
      nextUSDT: entry.nextUSDT,
      deltaUSDT: entry.deltaUSDT,
      source: entry.source,
      reason: entry.reason ? scrubText(entry.reason, secrets) : null,
    })),
    withdrawals: logs.withdrawals.slice(0, limit).map((entry) => ({
      id: entry.id,
      accountId: entry.account,
      createdAt: iso(entry.createdAt),
      trigger: entry.trigger,
      status: entry.status,
      mode: entry.mode,
      scheduleId: entry.scheduleId,
      scheduleName: entry.scheduleName ?? null,
      amountUSDT: entry.amountUSDT ?? null,
      availableSafeHavenUSDT: entry.availableSafeHavenUSDT ?? null,
      targetNetwork: entry.targetNetwork ?? null,
      targetWalletAddress: entry.targetWalletAddress ?? null,
      message: scrubText(entry.message, secrets),
      withdrawId: entry.withdrawId ?? null,
    })),
  };
}

/** Builds the credential-free monitoring snapshot shared by all SLOW instances. */
async function read(
  input: SlowMonitoringSnapshotInput,
  instanceName: string,
) {
  // PROD:MCP_MONITORING_SNAPSHOT
  // PROD:MCP_MONITORING_CREDENTIAL_REDACTION
  // PROD:MCP_MONITORING_EFFECTIVE_CONFIG
  // PROD:MCP_MONITORING_SECTION_FAILURE
  const sections = requestedSections(input.include);
  const catalog = await slowTradingStorage.data.load({ modeScope: "active" });
  const activeMode = slowTradingStorage.mode.getActive(catalog);
  const requestedMode =
    input.mode === "live" || input.mode === "sandbox" ? input.mode : "active";
  const resolvedMode = requestedMode === "active" ? activeMode : requestedMode;
  const accounts = catalog.runtime.exchangeAccounts;
  const secrets = secretValues(catalog);
  const issues: Array<{ section: string; code: string; message: string }> = [];
  const effectiveResults = sections.has("config")
    ? await Promise.allSettled(
        accounts.map(async (account) => ({
          id: account.slug,
          config: (
            await slowTradingStorage.data.load({
              account: account.slug,
              modeScope: "active",
            })
          ).config,
        })),
      )
    : [];
  const effectiveConfigs = effectiveResults.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    issues.push({ section: "config", code: "effective_config_unavailable", message: `Effective configuration is unavailable for account ${accounts[index]?.slug ?? "unknown"}.` });
    return [];
  });
  let logs: SlowTradingLogs | null = null;
  if (sections.has("logs")) {
    try {
      logs = await slowTradingStorage.logs.load();
    } catch {
      issues.push({ section: "logs", code: "logs_unavailable", message: "Operational logs are unavailable." });
    }
  }
  const logLimit = Math.min(100, Math.max(1, Number(input.logLimit) || 20));

  return {
    schemaVersion: "1.0" as const,
    generatedAt: new Date().toISOString(),
    status: issues.length ? "partial" as const : "complete" as const,
    issues,
    instance: {
      appName: instanceName,
      profileName: catalog.sharedConfig.name,
      description: catalog.sharedConfig.description,
      accountModel: "multi" as const,
      capabilities: {
        accountOverrides: true,
        sandboxPerAccount: true,
        withdrawalPerAccount: true,
      },
    },
    mode: { requested: requestedMode, active: activeMode, resolved: resolvedMode },
    ...(sections.has("config") && {
      config: {
        shared: cloneJson(catalog.sharedConfig),
        effectiveByAccount: Object.fromEntries(
          effectiveConfigs.map((item) => [item.id, cloneJson(item.config)]),
        ),
      },
    }),
    accounts: accounts.map((account) => ({
      id: account.slug,
      name: account.name,
      description: account.description,
      type: account.type,
      enabled: account.enabled,
      createdAt: iso(account.createdAt),
      updatedAt: iso(account.updatedAt),
      activeMode: account.sandbox.enabled ? "sandbox" as const : "live" as const,
      sandbox: cloneJson(account.sandbox),
      credentialStatus: {
        configured: Boolean(account.credentials.apiKey && account.credentials.apiSecret),
      },
    })),
    ...(sections.has("automation") && {
      automation: {
        withdrawals: {
          autoEnabled: catalog.runtime.withdrawal.autoEnabled,
          wallets: catalog.runtime.withdrawal.walletBook.map((wallet) => ({
            id: wallet.id,
            name: wallet.name,
            network: wallet.network,
            address: wallet.address,
          })),
          schedules: catalog.runtime.withdrawal.schedules.map((schedule) => ({
            id: schedule.id,
            accountId: schedule.account,
            name: schedule.name,
            enabled: schedule.enabled,
            amountUSDT: schedule.amountUSDT,
            dayOfMonth: schedule.dayOfMonth,
            walletId: schedule.walletId ?? null,
            targetNetwork: schedule.targetNetwork,
            targetWalletAddress: schedule.targetWalletAddress,
            lastAttemptAt: iso(schedule.lastAttemptAt),
            lastSuccessAt: iso(schedule.lastSuccessAt),
            lastQueuedAt: iso(schedule.lastQueuedAt),
            lastStatus: schedule.lastStatus ?? null,
          })),
        },
        safeHaven: {
          autoEnabled: catalog.runtime.safeHaven.autoEnabled,
          schedules: catalog.runtime.safeHaven.schedules.map((schedule) => ({
            id: schedule.id,
            accountId: null,
            name: schedule.name,
            enabled: schedule.enabled,
            amountUSDT: schedule.amountUSDT,
            pct: schedule.pct,
            dayOfMonth: schedule.dayOfMonth,
            lastQueuedAt: Object.fromEntries(
              Object.entries(schedule.lastQueuedAt ?? {}).map(([mode, time]) => [mode, iso(time)]),
            ),
          })),
        },
      },
    }),
    ...(logs && { logs: boundedLogs(logs, logLimit, secrets) }),
    redaction: {
      policy: "credentials-omitted-v1" as const,
      omitted: [
        "accounts[].credentials",
        "runtime.mcp.tokens[].tokenHash",
        "runtime.mcp.tokens[].tokenSecretEncrypted",
        "error.details",
        "error.stack",
      ],
    },
  };
}

const slowTradingMcpMonitoring = { read } as const;

export default slowTradingMcpMonitoring;
