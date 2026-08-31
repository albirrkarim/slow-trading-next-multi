import { FILES } from "@/components/storage";
import fs from "fs-extra";
import path from "path";
import type { SlowTradingMode } from "../types";
import { tradeLog } from "@/lib/trading/helper/log";

/** Daily balance snapshot used for the dashboard balance timeline. */
export type SlowTradingBalanceSnapshot = {
  /** UTC day key in YYYY-MM-DD format. */
  day: string;
  /** Snapshot timestamp in milliseconds. */
  timestamp: number;
  /** Total account value estimate for the day. */
  total: number;
};

function getBalanceSnapshotsFile(mode: SlowTradingMode): string {
  return FILES.slow[mode === "sandbox" ? "sandbox" : "prod"]
    .balanceSnapshots;
}

/** Reads the mode's persisted UTC-day balance snapshots in day order. */
export async function readSlowTradingBalanceSnapshots(
  mode: SlowTradingMode,
): Promise<SlowTradingBalanceSnapshot[]> {
  const historyFile = getBalanceSnapshotsFile(mode);
  if (!(await fs.pathExists(historyFile))) {
    return [];
  }

  const raw = await fs.readJSON(historyFile);
  if (!Array.isArray(raw)) {
    return [];
  }

  return (raw as SlowTradingBalanceSnapshot[])
    .filter(
      (snapshot) =>
        typeof snapshot?.day === "string" &&
        typeof snapshot?.timestamp === "number" &&
        Number.isFinite(snapshot.timestamp) &&
        typeof snapshot?.total === "number" &&
        Number.isFinite(snapshot.total),
    )
    .sort((left, right) => left.day.localeCompare(right.day));
}

/**
 * Upsert one slow-trading balance snapshot per UTC day.
 */
export async function upsertSlowTradingBalanceSnapshot(params: {
  mode: SlowTradingMode;
  total: number;
  timestamp?: number;
}) {
  try {
    const timestamp = params.timestamp ?? Date.now();
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const mode = params.mode ?? "live";
    const historyFile = getBalanceSnapshotsFile(mode);

    let history: SlowTradingBalanceSnapshot[] = [];
    if (await fs.pathExists(historyFile)) {
      history = await readSlowTradingBalanceSnapshots(mode);
    }

    const nextSnapshot: SlowTradingBalanceSnapshot = {
      day,
      timestamp,
      total: params.total,
    };

    const existingIndex = history.findIndex((h) => h.day === day);
    if (existingIndex >= 0) {
      history[existingIndex] = nextSnapshot;
    } else {
      history.push(nextSnapshot);
    }

    history.sort((a, b) => a.day.localeCompare(b.day));
    await fs.ensureDir(path.dirname(historyFile));
    await fs.writeJSON(historyFile, history);
  } catch (e) {
    tradeLog.error("[slow-trading] Failed to upsert balance snapshot", e);
  }
}
