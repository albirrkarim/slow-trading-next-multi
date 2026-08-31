import {
  SLOW_TRADING_MCP_PERMISSIONS,
  type SlowTradingMcpConfig,
  type SlowTradingMcpPermission,
  type SlowTradingMcpTokenRecord,
} from "../types";

const MCP_PERMISSION_SET = new Set<string>(SLOW_TRADING_MCP_PERMISSIONS);

export const DEFAULT_MCP_CONFIG: SlowTradingMcpConfig = {
  tokens: [],
};

function normalizeTimestamp(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function normalizePermissions(value: unknown): SlowTradingMcpPermission[] {
  if (!Array.isArray(value)) return [];
  const permissions = value
    .map((permission) => String(permission))
    .filter((permission): permission is SlowTradingMcpPermission =>
      MCP_PERMISSION_SET.has(permission),
    );
  return Array.from(new Set(permissions));
}

function normalizeTokenRecord(
  value: unknown,
): SlowTradingMcpTokenRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SlowTradingMcpTokenRecord>;
  const id = String(record.id ?? "").trim();
  const tokenHash = String(record.tokenHash ?? "").trim();
  const tokenSecretEncrypted = String(record.tokenSecretEncrypted ?? "").trim();
  if (
    !id ||
    !/^[a-f0-9]{64}$/i.test(tokenHash) ||
    !tokenSecretEncrypted.startsWith("v1:")
  ) {
    return null;
  }

  return {
    id,
    name: String(record.name ?? "MCP token").trim().slice(0, 80) || "MCP token",
    enabled: record.enabled === true,
    permissions: normalizePermissions(record.permissions),
    tokenHash,
    tokenSecretEncrypted,
    createdAt: normalizeTimestamp(record.createdAt),
    lastUsedAt:
      typeof record.lastUsedAt === "number" && Number.isFinite(record.lastUsedAt)
        ? record.lastUsedAt
        : undefined,
  };
}

/** Normalizes persisted MCP settings and drops invalid token rows. */
export function normalizeMcpConfig(value: unknown): SlowTradingMcpConfig {
  if (!value || typeof value !== "object") return DEFAULT_MCP_CONFIG;
  const raw = value as Partial<SlowTradingMcpConfig>;
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens
        .map((token) => normalizeTokenRecord(token))
        .filter((token): token is SlowTradingMcpTokenRecord => Boolean(token))
    : [];

  return { tokens };
}
