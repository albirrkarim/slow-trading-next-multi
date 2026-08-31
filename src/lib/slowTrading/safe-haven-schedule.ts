import type {
  SlowTradingMode,
  SlowTradingSafeHavenSchedule,
} from "./types";
import slowTradingWithdrawalSchedule from "./withdrawal-schedule";

/** Returns a schedule view compatible with the shared monthly timing rules. */
function toMonthlySchedule(
  schedule: SlowTradingSafeHavenSchedule,
  mode: SlowTradingMode,
) {
  return {
    ...schedule,
    lastQueuedAt: schedule.lastQueuedAt?.[mode],
    lastSuccessAt: undefined,
  };
}

/** Checks whether one Safe Haven schedule is due for a specific mode. */
function isDue(
  schedule: SlowTradingSafeHavenSchedule,
  mode: SlowTradingMode,
  currentTimeMs: number,
): boolean {
  return slowTradingWithdrawalSchedule.timing.isDue(
    toMonthlySchedule(schedule, mode),
    currentTimeMs,
  );
}

/** Resolves the current or next Safe Haven occurrence for a mode. */
function getNextOccurrenceAt(
  schedule: SlowTradingSafeHavenSchedule,
  mode: SlowTradingMode,
  currentTimeMs: number,
): number {
  return slowTradingWithdrawalSchedule.timing.getNextOccurrenceAt(
    toMonthlySchedule(schedule, mode),
    currentTimeMs,
  );
}

const slowTradingSafeHavenSchedule = {
  timing: {
    getNextOccurrenceAt,
    getOccurrenceAt:
      slowTradingWithdrawalSchedule.timing.getOccurrenceAt,
    isDue,
  },
  values: slowTradingWithdrawalSchedule.values,
} as const;

export default slowTradingSafeHavenSchedule;
