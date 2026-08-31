import type { SlowTradingWithdrawalSchedule } from "./types";

type MonthlyScheduleTiming = Pick<
  SlowTradingWithdrawalSchedule,
  "dayOfMonth" | "enabled" | "lastQueuedAt" | "lastSuccessAt"
>;

/** Clamps a configured withdrawal day into the supported monthly range. */
function normalizeDayOfMonth(value: unknown, fallback = 1): number {
  const numericValue = Number(value);
  const normalizedValue = Number.isFinite(numericValue)
    ? Math.floor(numericValue)
    : fallback;
  return Math.min(31, Math.max(1, normalizedValue));
}

/** Resolves a schedule's UTC occurrence, clamped to the month's final day. */
function getOccurrenceAt(
  schedule: Pick<SlowTradingWithdrawalSchedule, "dayOfMonth">,
  monthTimestamp: number,
): number {
  const date = new Date(monthTimestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const finalDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const scheduledDay = Math.min(
    normalizeDayOfMonth(schedule.dayOfMonth),
    finalDayOfMonth,
  );

  return Date.UTC(year, month, scheduledDay);
}

/** Checks whether a timestamp belongs to the same UTC month as another. */
function isSameUtcMonth(first: number, second: number): boolean {
  const firstDate = new Date(first);
  const secondDate = new Date(second);
  return (
    firstDate.getUTCFullYear() === secondDate.getUTCFullYear() &&
    firstDate.getUTCMonth() === secondDate.getUTCMonth()
  );
}

/** Returns the latest queued or successful occurrence marker. */
function getLastHandledAt(schedule: MonthlyScheduleTiming): number {
  return Math.max(
    Number(schedule.lastQueuedAt) || 0,
    Number(schedule.lastSuccessAt) || 0,
  );
}

/** Checks whether a monthly withdrawal schedule is currently due. */
function isDue(
  schedule: MonthlyScheduleTiming,
  currentTimeMs: number,
): boolean {
  if (!schedule.enabled) {
    return false;
  }

  const occurrenceAt = getOccurrenceAt(schedule, currentTimeMs);
  const lastHandledAt = getLastHandledAt(schedule);
  const currentMonthHandled =
    lastHandledAt > 0 && isSameUtcMonth(lastHandledAt, currentTimeMs);

  return currentTimeMs >= occurrenceAt && !currentMonthHandled;
}

/**
 * Resolves the current due occurrence or the next month's occurrence after the
 * current month has already been handled.
 */
function getNextOccurrenceAt(
  schedule: MonthlyScheduleTiming,
  currentTimeMs: number,
): number {
  const lastHandledAt = getLastHandledAt(schedule);
  const currentMonthHandled =
    lastHandledAt > 0 && isSameUtcMonth(lastHandledAt, currentTimeMs);
  if (!currentMonthHandled) {
    return getOccurrenceAt(schedule, currentTimeMs);
  }

  const currentDate = new Date(currentTimeMs);
  const nextMonth = Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth() + 1,
    1,
  );
  return getOccurrenceAt(schedule, nextMonth);
}

/** Shared pure monthly withdrawal schedule calculations. */
const slowTradingWithdrawalSchedule = {
  timing: {
    getNextOccurrenceAt,
    getOccurrenceAt,
    isDue,
  },
  values: {
    normalizeDayOfMonth,
  },
} as const;

export default slowTradingWithdrawalSchedule;
