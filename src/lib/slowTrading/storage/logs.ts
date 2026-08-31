import { FILES } from "@/components/storage";
import fs from "fs-extra";
import { clone } from "./common";
import { MAX_SLOW_TRADING_LOG_ENTRIES } from "./constants";
import slowTradingJsonFile from "./json-file";
import type {
  SlowTradingErrorLogEntry,
  SlowTradingErrorStatus,
  SlowTradingErrorStatusUpdateResult,
  SlowTradingLogKind,
  SlowTradingLogs,
  SlowTradingManagementLogEntry,
  SlowTradingMode,
  SlowTradingSafeHavenLogEntry,
  SlowTradingWithdrawalLogEntry,
} from "../types";

/**
 * Creates log id with the default SLOW storage shape.
 */
function createLogId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Converts json safe details into a JSON-safe SLOW value.
 */
function toJsonSafeDetails(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  try {
    return clone(value as Record<string, unknown>);
  } catch {
    return {
      value: String(value),
    };
  }
}

/**
 * Reads log file from SLOW persistent storage.
 */
async function readLogFile<T>(filePath: string): Promise<T[]> {
  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  const raw = await fs.readJSON(filePath).catch(() => []);
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/**
 * Appends log file to SLOW persistent storage.
 */
async function appendLogFile<T extends { createdAt: number }>(
  filePath: string,
  entry: T,
): Promise<T[]> {
  return slowTradingJsonFile.update.atomic<T[]>(filePath, (raw) => {
    const current = Array.isArray(raw) ? (raw as T[]) : [];
    return [...current, entry]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-MAX_SLOW_TRADING_LOG_ENTRIES);
  });
}

/** Gets the persistent file used by one dashboard log collection. */
function getLogFilePath(kind: SlowTradingLogKind): string {
  const fileByKind: Record<SlowTradingLogKind, string> = {
    errors: FILES.slow.logs.errors,
    management: FILES.slow.logs.management,
    safe_haven: FILES.slow.logs.safeHaven,
    withdrawals: FILES.slow.logs.withdrawals,
  };

  return fileByKind[kind];
}

/** Deletes one SLOW log record by its stable id. */
export async function deleteSlowTradingLogEntry(
  kind: SlowTradingLogKind,
  id: string,
): Promise<boolean> {
  const filePath = getLogFilePath(kind);
  let deleted = false;
  await slowTradingJsonFile.update.atomic<unknown[]>(filePath, (raw) => {
    const current = Array.isArray(raw) ? raw : [];
    const next = current.filter(
      (entry) => !(entry && typeof entry === "object" && "id" in entry && entry.id === id),
    );
    deleted = next.length !== current.length;
    return next;
  });
  return deleted;
}

/** Deletes every record from one SLOW log collection. */
export async function clearSlowTradingLogEntries(
  kind: SlowTradingLogKind,
): Promise<number> {
  const filePath = getLogFilePath(kind);
  let cleared = 0;
  await slowTradingJsonFile.update.atomic<unknown[]>(filePath, (raw) => {
    cleared = Array.isArray(raw) ? raw.length : 0;
    return [];
  });
  return cleared;
}

/** Updates error triage status without racing concurrent error appends. */
export async function updateSlowTradingErrorLogStatuses(
  ids: string[],
  status: SlowTradingErrorStatus,
): Promise<SlowTradingErrorStatusUpdateResult> {
  const requestedIds = new Set(ids);
  let updated: SlowTradingErrorLogEntry[] = [];
  let missingIds: string[] = [];

  await slowTradingJsonFile.update.atomic<SlowTradingErrorLogEntry[]>(
    FILES.slow.logs.errors,
    (raw) => {
      const current = Array.isArray(raw)
        ? (raw as SlowTradingErrorLogEntry[])
        : [];
      const existingIds = new Set(current.map((entry) => entry.id));
      missingIds = ids.filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        return current;
      }

      updated = current
        .filter((entry) => requestedIds.has(entry.id))
        .map((entry) => ({ ...entry, status }));
      const updatesById = new Map(updated.map((entry) => [entry.id, entry]));
      return current.map((entry) => updatesById.get(entry.id) ?? entry);
    },
  );

  return { missingIds, updated };
}

/**
 * Gets error message from SLOW state or storage.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown slow trading error";
}

/**
 * Gets error stack from SLOW state or storage.
 */
function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

// PROD:ERROR_LOG
/**
 * Appends slow trading error log to SLOW persistent storage.
 */
export async function appendSlowTradingErrorLog(params: {
  source: string;
  error: unknown;
  details?: Record<string, unknown>;
  timestamp?: number;
}): Promise<SlowTradingErrorLogEntry> {
  const entry: SlowTradingErrorLogEntry = {
    id: createLogId("err"),
    createdAt: params.timestamp ?? Date.now(),
    source: params.source,
    status: "new",
    message: getErrorMessage(params.error),
    ...(getErrorStack(params.error)
      ? { stack: getErrorStack(params.error) }
      : {}),
    ...(params.details ? { details: toJsonSafeDetails(params.details) } : {}),
  };

  await appendLogFile(FILES.slow.logs.errors, entry);
  return entry;
}

// PROD:MANAGEMENT_LOG
/** Appends one configured-symbol management action to persistent storage. */
export async function appendSlowTradingManagementLog(params: {
  action: "add" | "remove";
  symbol: string;
  source: string;
  reason: string;
  timestamp?: number;
}): Promise<SlowTradingManagementLogEntry> {
  const entry: SlowTradingManagementLogEntry = {
    id: createLogId("management"),
    createdAt: params.timestamp ?? Date.now(),
    action: params.action,
    symbol: String(params.symbol || "").trim().toUpperCase(),
    source: params.source,
    reason: params.reason,
  };

  await appendLogFile(FILES.slow.logs.management, entry);
  return entry;
}

// PROD:SAFE_HAVEN_LOG
/**
 * Appends slow trading safe haven log to SLOW persistent storage.
 */
export async function appendSlowTradingSafeHavenLog(params: {
  mode: SlowTradingMode;
  previousUSDT: number;
  nextUSDT: number;
  source: string;
  reason?: string;
  timestamp?: number;
}): Promise<SlowTradingSafeHavenLogEntry> {
  const previousUSDT = Number(params.previousUSDT) || 0;
  const nextUSDT = Number(params.nextUSDT) || 0;
  const entry: SlowTradingSafeHavenLogEntry = {
    id: createLogId("safe-haven"),
    createdAt: params.timestamp ?? Date.now(),
    mode: params.mode,
    previousUSDT,
    nextUSDT,
    deltaUSDT: Number((nextUSDT - previousUSDT).toFixed(8)),
    source: params.source,
    ...(params.reason ? { reason: params.reason } : {}),
  };

  await appendLogFile(FILES.slow.logs.safeHaven, entry);
  return entry;
}

// PROD:WITHDRAWAL_LOG
/**
 * Appends slow trading withdrawal log to SLOW persistent storage.
 */
export async function appendSlowTradingWithdrawalLog(
  params: Omit<SlowTradingWithdrawalLogEntry, "id" | "createdAt"> & {
    timestamp?: number;
  },
): Promise<SlowTradingWithdrawalLogEntry> {
  const entry: SlowTradingWithdrawalLogEntry = {
    ...params,
    id: createLogId("withdrawal"),
    createdAt: params.timestamp ?? Date.now(),
  };

  await appendLogFile(FILES.slow.logs.withdrawals, entry);
  return entry;
}

/**
 * Loads slow trading logs from SLOW persistent storage.
 */
export async function loadSlowTradingLogs(): Promise<SlowTradingLogs> {
  const [errors, management, safeHaven, withdrawals] = await Promise.all([
    readLogFile<SlowTradingErrorLogEntry>(FILES.slow.logs.errors),
    readLogFile<SlowTradingManagementLogEntry>(FILES.slow.logs.management),
    readLogFile<SlowTradingSafeHavenLogEntry>(FILES.slow.logs.safeHaven),
    readLogFile<SlowTradingWithdrawalLogEntry>(FILES.slow.logs.withdrawals),
  ]);

  return {
    errors: errors.sort((a, b) => b.createdAt - a.createdAt),
    management: management.sort((a, b) => b.createdAt - a.createdAt),
    safeHaven: safeHaven.sort((a, b) => b.createdAt - a.createdAt),
    withdrawals: withdrawals.sort((a, b) => b.createdAt - a.createdAt),
  };
}
