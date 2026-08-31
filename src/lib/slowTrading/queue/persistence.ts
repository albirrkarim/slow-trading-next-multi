import { FILES } from "@/components/storage";
import fs from "fs-extra";
import path from "path";

import type {
  SlowTradingQueues,
  SlowTradingMode,
  SlowTradingSafeHavenQueueItem,
  SlowTradingWithdrawalQueueItem,
} from "../types";

export type SlowTradingQueueKind = "safe_haven" | "withdrawal";

interface SlowTradingQueueLoadOptions {
  /** Mode assigned when migrating a legacy Safe Haven item with no mode. */
  legacySafeHavenMode?: SlowTradingMode;
}

let mutationChain: Promise<void> = Promise.resolve();

/** Creates an empty queue payload for new SLOW installations. */
export function createEmptySlowTradingQueues(): SlowTradingQueues {
  return {
    safeHaven: [],
    withdrawals: [],
  };
}

/** Normalizes a timestamp into a positive millisecond value. */
function normalizeTime(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Normalizes one Safe Haven queue item loaded from disk. */
function normalizeSafeHavenQueueItem(
  value: unknown,
  options: SlowTradingQueueLoadOptions,
): SlowTradingSafeHavenQueueItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SlowTradingSafeHavenQueueItem>;
  const id = String(raw.id ?? "").trim();
  const period = String(raw.period ?? "").trim();
  const requestedUSDT = Math.max(0, Number(raw.requestedUSDT) || 0);
  const remainingUSDT = Math.min(
    requestedUSDT,
    Math.max(0, Number(raw.remainingUSDT) || 0),
  );
  const createdAt = normalizeTime(raw.createdAt, Date.now());

  if (!id || !period || !(requestedUSDT > 0) || !(remainingUSDT > 0)) {
    return null;
  }

  return {
    id,
    kind: "safe_haven",
    mode:
      raw.mode === "sandbox" || raw.mode === "live"
        ? raw.mode
        : options.legacySafeHavenMode ?? "live",
    period,
    ...(String(raw.scheduleId ?? "").trim()
      ? { scheduleId: String(raw.scheduleId).trim() }
      : {}),
    ...(String(raw.scheduleName ?? "").trim()
      ? { scheduleName: String(raw.scheduleName).trim() }
      : {}),
    requestedUSDT,
    remainingUSDT,
    createdAt,
    nextAttemptAt: normalizeTime(raw.nextAttemptAt, createdAt),
    lastMessage:
      String(raw.lastMessage ?? "").trim() ||
      "Waiting for the first Safe Haven attempt.",
    ...(Number(raw.lastAttemptAt) > 0
      ? { lastAttemptAt: Number(raw.lastAttemptAt) }
      : {}),
  };
}

/** Normalizes one withdrawal queue item loaded from disk. */
function normalizeWithdrawalQueueItem(
  value: unknown,
): SlowTradingWithdrawalQueueItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SlowTradingWithdrawalQueueItem>;
  const id = String(raw.id ?? "").trim();
  const scheduleId = String(raw.scheduleId ?? "").trim();
  const amountUSDT = Math.max(0, Number(raw.amountUSDT) || 0);
  const createdAt = normalizeTime(raw.createdAt, Date.now());

  if (!id || !scheduleId || !(amountUSDT > 0)) {
    return null;
  }

  return {
    id,
    kind: "withdrawal",
    scheduleId,
    scheduleName:
      String(raw.scheduleName ?? "").trim() || "Withdrawal Schedule",
    amountUSDT,
    targetNetwork: String(raw.targetNetwork ?? "")
      .trim()
      .toUpperCase(),
    targetWalletAddress: String(raw.targetWalletAddress ?? "").trim(),
    clientWithdrawId:
      String(raw.clientWithdrawId ?? "").trim() ||
      `slow-queue-${id}`.slice(0, 64),
    createdAt,
    nextAttemptAt: normalizeTime(raw.nextAttemptAt, createdAt),
    lastMessage:
      String(raw.lastMessage ?? "").trim() ||
      "Waiting for the first withdrawal attempt.",
    ...(Number(raw.lastAttemptAt) > 0
      ? { lastAttemptAt: Number(raw.lastAttemptAt) }
      : {}),
  };
}

/** Normalizes the queue file while dropping invalid or completed rows. */
function normalizeSlowTradingQueues(
  value: unknown,
  options: SlowTradingQueueLoadOptions = {},
): SlowTradingQueues {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<SlowTradingQueues>)
      : {};

  return {
    safeHaven: Array.isArray(raw.safeHaven)
      ? raw.safeHaven
          .map((item) => normalizeSafeHavenQueueItem(item, options))
          .filter(
            (item): item is SlowTradingSafeHavenQueueItem => Boolean(item),
          )
      : [],
    withdrawals: Array.isArray(raw.withdrawals)
      ? raw.withdrawals
          .map(normalizeWithdrawalQueueItem)
          .filter(
            (item): item is SlowTradingWithdrawalQueueItem => Boolean(item),
          )
      : [],
  };
}

/** Reads the persistent SLOW queue file. */
export async function loadSlowTradingQueues(
  options: SlowTradingQueueLoadOptions = {},
): Promise<SlowTradingQueues> {
  if (!(await fs.pathExists(FILES.slow.queue))) {
    return createEmptySlowTradingQueues();
  }

  const raw = await fs
    .readJSON(FILES.slow.queue)
    .catch(() => createEmptySlowTradingQueues());
  return normalizeSlowTradingQueues(raw, options);
}

/** Writes queues atomically so dashboard reads never observe partial JSON. */
async function writeSlowTradingQueues(
  queues: SlowTradingQueues,
  options: SlowTradingQueueLoadOptions,
): Promise<void> {
  const normalized = normalizeSlowTradingQueues(queues, options);
  const temporaryPath = `${FILES.slow.queue}.${process.pid}.tmp`;

  await fs.ensureDir(path.dirname(FILES.slow.queue));
  await fs.writeJSON(temporaryPath, normalized);
  await fs.move(temporaryPath, FILES.slow.queue, { overwrite: true });
}

/** Serializes one queue mutation against other in-process queue mutations. */
function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(mutation, mutation);
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Mutates and persists the latest queue payload. */
export function mutateSlowTradingQueues<T>(
  mutation: (queues: SlowTradingQueues) => T | Promise<T>,
  options: SlowTradingQueueLoadOptions = {},
): Promise<T> {
  return serializeMutation(async () => {
    const queues = await loadSlowTradingQueues(options);
    const result = await mutation(queues);
    await writeSlowTradingQueues(queues, options);
    return result;
  });
}

/** Deletes one queue item by kind and stable id. */
export function deleteSlowTradingQueueItem(
  kind: SlowTradingQueueKind,
  id: string,
  options: SlowTradingQueueLoadOptions = {},
): Promise<boolean> {
  return mutateSlowTradingQueues(
    (queues) => {
      const collection =
        kind === "safe_haven" ? queues.safeHaven : queues.withdrawals;
      const index = collection.findIndex((item) => item.id === id);

      if (index < 0) {
        return false;
      }

      collection.splice(index, 1);
      return true;
    },
    options,
  );
}
