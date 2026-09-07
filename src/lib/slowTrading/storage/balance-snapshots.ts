import { FILES } from "@/components/storage";
import { tradeLog } from "@/lib/trading/helper/log";
import fs from "fs-extra";
import path from "path";
import type { SlowTradingMode } from "../types";
import slowTradingJsonFile from "./json-file";

/** Daily balance snapshot used for the dashboard balance timeline. */
export type SlowTradingBalanceSnapshot = {
  /** UTC day key in YYYY-MM-DD format. */
  day: string;
  /** Snapshot timestamp in milliseconds. */
  timestamp: number;
  /** Total account value estimate for the day. */
  total: number;
};

function getLegacyBalanceSnapshotsFile(mode: SlowTradingMode): string {
  return FILES.slow[mode === "sandbox" ? "sandbox" : "prod"]
    .balanceSnapshots;
}

function getAccountBalanceSnapshotsFile(params: {
  account: string;
  mode: SlowTradingMode;
}): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.account)) {
    throw new Error(`Invalid exchange account slug: ${params.account}`);
  }

  return path.join(
    path.dirname(getLegacyBalanceSnapshotsFile(params.mode)),
    "balance_snapshots",
    `${params.account}.json`,
  );
}

function normalizeBalanceSnapshots(
  raw: unknown,
): SlowTradingBalanceSnapshot[] {
  if (!Array.isArray(raw)) return [];

  return (raw as SlowTradingBalanceSnapshot[])
    .filter(
      (snapshot) =>
        typeof snapshot?.day === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(snapshot.day) &&
        typeof snapshot?.timestamp === "number" &&
        Number.isFinite(snapshot.timestamp) &&
        typeof snapshot?.total === "number" &&
        Number.isFinite(snapshot.total),
    )
    .sort((left, right) => left.day.localeCompare(right.day));
}

async function readBalanceSnapshotsFile(
  filePath: string,
): Promise<SlowTradingBalanceSnapshot[]> {
  if (!(await fs.pathExists(filePath))) return [];
  return normalizeBalanceSnapshots(await fs.readJSON(filePath));
}

/** Reads one account's persisted UTC-day balance snapshots in day order. */
export async function readSlowTradingBalanceSnapshots(params: {
  account: string;
  mode: SlowTradingMode;
}): Promise<SlowTradingBalanceSnapshot[]> {
  return readBalanceSnapshotsFile(getAccountBalanceSnapshotsFile(params));
}

/** Reads the pre-multi-account mode-wide snapshot file for fallback only. */
export async function readLegacySlowTradingBalanceSnapshots(
  mode: SlowTradingMode,
): Promise<SlowTradingBalanceSnapshot[]> {
  return readBalanceSnapshotsFile(getLegacyBalanceSnapshotsFile(mode));
}

/**
 * Sums account snapshots by UTC day, carrying each account's latest known
 * balance forward only after that account has produced its first snapshot.
 */
export function aggregateSlowTradingBalanceSnapshots(
  accountSnapshots: readonly (readonly SlowTradingBalanceSnapshot[])[],
): SlowTradingBalanceSnapshot[] {
  // PROD:MULTI_ACCOUNT_DAILY_BALANCE_SNAPSHOTS
  const series = accountSnapshots.map((snapshots) =>
    normalizeBalanceSnapshots(snapshots),
  );
  const days = Array.from(
    new Set(series.flatMap((snapshots) => snapshots.map(({ day }) => day))),
  ).sort((left, right) => left.localeCompare(right));
  const indexes = series.map(() => 0);
  const latest = series.map<SlowTradingBalanceSnapshot | undefined>(
    () => undefined,
  );

  return days.map((day) => {
    let timestamp = 0;
    let total = 0;

    series.forEach((snapshots, seriesIndex) => {
      while (
        indexes[seriesIndex]! < snapshots.length &&
        snapshots[indexes[seriesIndex]!]!.day <= day
      ) {
        const snapshot = snapshots[indexes[seriesIndex]!]!;
        latest[seriesIndex] = snapshot;
        indexes[seriesIndex]! += 1;
        if (snapshot.day === day) {
          timestamp = Math.max(timestamp, snapshot.timestamp);
        }
      }

      total += latest[seriesIndex]?.total ?? 0;
    });

    return { day, timestamp, total };
  });
}

/**
 * Reads and aggregates the selected account snapshots. The old shared file is
 * returned only when no selected account has account-scoped snapshot data.
 */
export async function readCombinedSlowTradingBalanceSnapshots(params: {
  accounts: readonly string[];
  mode: SlowTradingMode;
}): Promise<SlowTradingBalanceSnapshot[]> {
  const accountSnapshots = await Promise.all(
    Array.from(new Set(params.accounts)).map((account) =>
      readSlowTradingBalanceSnapshots({ account, mode: params.mode }),
    ),
  );

  if (accountSnapshots.some((snapshots) => snapshots.length > 0)) {
    return aggregateSlowTradingBalanceSnapshots(accountSnapshots);
  }

  return readLegacySlowTradingBalanceSnapshots(params.mode);
}

/** Upserts one account-scoped SLOW balance snapshot per UTC day. */
export async function upsertSlowTradingBalanceSnapshot(params: {
  account: string;
  mode: SlowTradingMode;
  total: number;
  timestamp?: number;
}) {
  try {
    const timestamp = params.timestamp ?? Date.now();
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const historyFile = getAccountBalanceSnapshotsFile(params);

    await slowTradingJsonFile.update.atomic(historyFile, (raw) => {
      const history = normalizeBalanceSnapshots(raw);
      const nextSnapshot: SlowTradingBalanceSnapshot = {
        day,
        timestamp,
        total: params.total,
      };
      const existingIndex = history.findIndex(
        (snapshot) => snapshot.day === day,
      );

      if (existingIndex >= 0) {
        history[existingIndex] = nextSnapshot;
      } else {
        history.push(nextSnapshot);
      }

      return history.sort((left, right) => left.day.localeCompare(right.day));
    });
  } catch (error) {
    tradeLog.error("[slow-trading] Failed to upsert balance snapshot", error);
  }
}
