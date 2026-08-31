import slowTradingPerformance, {
  type SlowTradingCyclePerformanceEntry,
} from "./performance";
import type {
  SlowTradingModeState,
  SlowTradingStage,
  SlowTradingStageRunStats,
} from "./types";

/** Updates legacy run fields and the matching independently scheduled stage. */
function recordCompleted(params: {
  cycleStartedAt: number;
  modeState: SlowTradingModeState;
  performanceEntries: SlowTradingCyclePerformanceEntry[];
  reports: number;
  stage?: SlowTradingStage;
  summary: string;
  symbols: number;
}): SlowTradingStageRunStats {
  const t = Date.now();
  const ms = Math.max(0, t - params.cycleStartedAt);
  const performance = slowTradingPerformance.cycle.summarize(
    params.performanceEntries,
    ms,
  );

  params.modeState.lastRunAt = t;
  params.modeState.lastRunDurationMs = ms;
  params.modeState.lastRunSummary = params.summary;
  params.modeState.lastRunPerformance = performance;

  const runStats: SlowTradingStageRunStats = {
    t,
    ms,
    symbols: params.symbols,
    reports: params.reports,
    summary: params.summary,
    performance,
  };
  if (params.stage) {
    // PROD:STAGE_RUN_STATS
    params.modeState.stageRuns = {
      ...(params.modeState.stageRuns ?? {}),
      [params.stage]: runStats,
    };
  }

  return runStats;
}

const slowTradingStageRun = {
  recordCompleted,
} as const;

export default slowTradingStageRun;
export { slowTradingStageRun };
