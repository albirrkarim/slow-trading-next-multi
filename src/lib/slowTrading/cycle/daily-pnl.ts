import slowTradingDailyPnlLimit, {
  type DailyPnlLimitEvaluation,
} from "../daily-pnl-limit";
import slowTradingStorage from "../storage";
import type { SlowTradingMode, SlowTradingModeState } from "../types";

/** Reads today's archived trades and evaluates the navbar-style daily PnL stop. */
async function evaluateCurrent(params: {
  currentTimeMs: number;
  includePendingArchive?: boolean;
  mode: SlowTradingMode;
  modeState: SlowTradingModeState;
  thresholdUsdt: number;
}): Promise<DailyPnlLimitEvaluation> {
  const period = slowTradingDailyPnlLimit.period.getCurrentUtc(
    params.currentTimeMs,
  );
  // PROD:MULTI_ACCOUNT_COMBINED_DAILY_PNL
  // History files are shared, so always recompute from every account instead of
  // trusting an account-scoped cache from a previous cycle.
  const archived = (
    await Promise.all(
      (["live", "sandbox"] as const).map((mode) =>
        slowTradingStorage.history.readRange({
          endTime: period.endTime,
          mode,
          startTime: period.startTime,
        }),
      ),
    )
  ).flat();
  let pnlUsdt = slowTradingDailyPnlLimit.pnl.sumForUtcDay(
    archived,
    period.day,
  );

  if (params.includePendingArchive) {
    const pendingArchive = params.modeState.tradeSettings.flatMap(
      (tradeSetting) => tradeSetting.model_memory.positionsSell ?? [],
    );
    pnlUsdt += slowTradingDailyPnlLimit.pnl.sumForUtcDay(
      pendingArchive,
      period.day,
    );
  }

  return slowTradingDailyPnlLimit.guard.evaluatePnl({
    currentTimeMs: params.currentTimeMs,
    pnlUsdt,
    thresholdUsdt: params.thresholdUsdt,
  });
}

const slowTradingCycleDailyPnl = {
  evaluateCurrent,
} as const;

export default slowTradingCycleDailyPnl;
