import type {
  SlowTradingWithdrawalConfig,
  SlowTradingWithdrawalSchedule,
  SlowTradingWithdrawalWallet,
} from "../types";
import slowTradingWithdrawalSchedule from "../withdrawal-schedule";

/**
 * Normalizes id into the shape expected by SLOW.
 */
function normalizeId(value: unknown, fallback: string): string {
  const id = String(value ?? "").trim();
  return id || fallback;
}

/**
 * Normalizes withdrawal wallet into the shape expected by SLOW.
 */
function normalizeWithdrawalWallet(
  value: unknown,
  index: number,
): SlowTradingWithdrawalWallet | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SlowTradingWithdrawalWallet>;
  const name = String(raw.name ?? "").trim();
  const network = String(raw.network ?? "")
    .trim()
    .toUpperCase();
  const address = String(raw.address ?? "").trim();

  if (!name && !network && !address) {
    return null;
  }

  return {
    id: normalizeId(raw.id, `wallet-${index + 1}`),
    name: name || `Wallet ${index + 1}`,
    network,
    address,
  };
}

/**
 * Normalizes withdrawal schedule into the shape expected by SLOW.
 */
function normalizeWithdrawalSchedule(
  value: unknown,
  index: number,
): SlowTradingWithdrawalSchedule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SlowTradingWithdrawalSchedule> & {
    intervalDays?: unknown;
  };
  const amountUSDT = Math.max(0, Number(raw.amountUSDT) || 0);
  const dayOfMonth = slowTradingWithdrawalSchedule.values.normalizeDayOfMonth(
    raw.dayOfMonth ?? raw.intervalDays,
  );
  const lastAttemptAt = Number(raw.lastAttemptAt);
  const lastSuccessAt = Number(raw.lastSuccessAt);
  const lastQueuedAt = Number(raw.lastQueuedAt);

  return {
    id: normalizeId(raw.id, `schedule-${index + 1}`),
    name: String(raw.name ?? "").trim() || `Schedule ${index + 1}`,
    enabled: raw.enabled !== false,
    amountUSDT,
    dayOfMonth,
    ...(String(raw.walletId ?? "").trim()
      ? { walletId: String(raw.walletId).trim() }
      : {}),
    targetNetwork: String(raw.targetNetwork ?? "")
      .trim()
      .toUpperCase(),
    targetWalletAddress: String(raw.targetWalletAddress ?? "").trim(),
    ...(Number.isFinite(lastAttemptAt) && lastAttemptAt > 0
      ? { lastAttemptAt }
      : {}),
    ...(Number.isFinite(lastSuccessAt) && lastSuccessAt > 0
      ? { lastSuccessAt }
      : {}),
    ...(Number.isFinite(lastQueuedAt) && lastQueuedAt > 0
      ? { lastQueuedAt }
      : {}),
    ...(typeof raw.lastStatus === "string" && raw.lastStatus.trim()
      ? { lastStatus: raw.lastStatus.trim() }
      : {}),
  };
}

/**
 * Normalizes withdrawal config into the shape expected by SLOW.
 */
export function normalizeWithdrawalConfig(
  value: unknown,
): SlowTradingWithdrawalConfig {
  // A. Read the modern withdrawal object or fall back to an empty config.
  const raw =
    value && typeof value === "object"
      ? (value as Partial<SlowTradingWithdrawalConfig> & {
          amountUSDT?: unknown;
          dayOfMonth?: unknown;
          intervalDays?: unknown;
          targetNetwork?: unknown;
          targetWalletAddress?: unknown;
          lastAttemptAt?: unknown;
          lastSuccessAt?: unknown;
          lastStatus?: unknown;
        })
      : {};
  // B. Normalize wallet-book entries before schedules reference them.
  const walletBook = Array.isArray(raw.walletBook)
    ? raw.walletBook
        .map((wallet, index) => normalizeWithdrawalWallet(wallet, index))
        .filter((wallet): wallet is SlowTradingWithdrawalWallet =>
          Boolean(wallet),
        )
    : [];
  // C. Convert legacy single-schedule fields into the current schedules array.
  const schedulesRaw = Array.isArray(raw.schedules) ? raw.schedules : [];
  const legacySchedule =
    !Array.isArray(raw.schedules) &&
    ((Number(raw.amountUSDT) || 0) > 0 ||
      String(raw.targetNetwork ?? "").trim() ||
      String(raw.targetWalletAddress ?? "").trim())
      ? [
          {
            id: "legacy-withdrawal",
            name: "Default Withdrawal",
            enabled: true,
            amountUSDT: raw.amountUSDT,
            dayOfMonth: raw.dayOfMonth ?? raw.intervalDays,
            targetNetwork: raw.targetNetwork,
            targetWalletAddress: raw.targetWalletAddress,
            lastAttemptAt: raw.lastAttemptAt,
            lastSuccessAt: raw.lastSuccessAt,
            lastStatus: raw.lastStatus,
          },
        ]
      : [];
  const schedules = [...schedulesRaw, ...legacySchedule]
    .map((schedule, index) => normalizeWithdrawalSchedule(schedule, index))
    .filter((schedule): schedule is SlowTradingWithdrawalSchedule =>
      Boolean(schedule),
    );

  return {
    autoEnabled: Boolean(raw.autoEnabled),
    schedules,
    walletBook,
  };
}
