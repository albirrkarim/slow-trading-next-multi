import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { Position } from "@/lib/trading/models";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import { hasPositionHitTargetVolatilityPoint } from "./watch-reserve";
import type {
  SlowTradingModeState,
  SlowTradingRuntimeConfig,
  SlowTradingStage,
} from "./types";

export type { SlowTradingStage } from "./types";

export const SLOW_TRADING_STAGE_ORDER: SlowTradingStage[] = [
  "risk-sentinel",
  "speedup",
  "standard-monitoring",
  "management",
  "capture-entry",
];

export const DEFAULT_SPEEDUP_POSITIVE_PNL_THRESHOLD_PCT = 1.5;
export const DEFAULT_SPEEDUP_NEGATIVE_PNL_THRESHOLD_PCT = 1.5;
export const DEFAULT_SPEEDUP_TAKE_PROFIT_OFFSET_PCT = 0.5;

export type SpeedupStageReason =
  | "POSITIVE_PNL_THRESHOLD"
  | "NEGATIVE_PNL_THRESHOLD"
  | "STOP_LOSS_PLUS_ARMED"
  | "NEAR_TAKE_PROFIT"
  | "POST_AVERAGE_TARGET_APPROACH"
  | "TARGET_VPOINT_HIT";

const SPEEDUP_REASON_LABELS: Record<SpeedupStageReason, string> = {
  POSITIVE_PNL_THRESHOLD: "positive PnL threshold",
  NEGATIVE_PNL_THRESHOLD: "negative PnL threshold",
  STOP_LOSS_PLUS_ARMED: "StopLoss+ armed",
  NEAR_TAKE_PROFIT: "near take profit",
  POST_AVERAGE_TARGET_APPROACH: "post-average target approach",
  TARGET_VPOINT_HIT: "target vPoint hit",
};

/** Formats all matching Speedup reasons for persisted diagnostics and UI. */
function describeSpeedupReasons(reasons: SpeedupStageReason[]): string {
  if (reasons.length === 0) {
    return "No Speedup rule matched";
  }

  return reasons.map((reason) => SPEEDUP_REASON_LABELS[reason]).join(", ");
}

/** Explains why a position remains in Standard using canonical persisted PnL. */
function describeStandardReason(params: {
  negativePnlThresholdPct?: number;
  positivePnlThresholdPct?: number;
  position: Position;
}): string {
  const netPct = Number(params.position.pnl.netPct);
  const netPctLabel = Number.isFinite(netPct) ? `${netPct}%` : "unavailable";
  const positiveThresholdPct = normalizeSpeedupPercent(
    params.positivePnlThresholdPct,
    DEFAULT_SPEEDUP_POSITIVE_PNL_THRESHOLD_PCT,
  );
  const negativeThresholdPct = normalizeSpeedupPercent(
    params.negativePnlThresholdPct,
    DEFAULT_SPEEDUP_NEGATIVE_PNL_THRESHOLD_PCT,
  );

  return (
    `No Speedup rule matched: canonical net PnL ${netPctLabel}; ` +
    `PnL rules require >= +${positiveThresholdPct}% or <= -${negativeThresholdPct}%`
  );
}

const DEFAULT_INTERVAL_MINUTES: Record<SlowTradingStage, number> = {
  "risk-sentinel": 1,
  speedup: 1,
  "standard-monitoring": 5,
  management: 5,
  "capture-entry": 5,
};

/** Normalizes a stage interval to a positive whole number of minutes. */
function normalizeIntervalMinutes(
  value: unknown,
  fallbackMinutes: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMinutes;
  }

  return Math.max(1, Math.floor(parsed));
}

/** Normalizes a non-negative percentage used by Speedup classification. */
function normalizeSpeedupPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
}

/** Returns the reasons that currently place a position in Speedup. */
function getSpeedupReasons(params: {
  latestVolatilityPoint?: Pick<VolatilityPoint, "p">;
  negativePnlThresholdPct?: number;
  positivePnlThresholdPct?: number;
  position: Position;
  takeProfitOffsetPct?: number;
  takeProfitPercent?: number;
  useStopLossPlus?: boolean;
  volatilityPoints?: Array<Pick<VolatilityPoint, "l" | "t">>;
  volatilityThresholdPct?: number;
}): SpeedupStageReason[] {
  const reasons: SpeedupStageReason[] = [];
  const netPct = Number(params.position.pnl.netPct);
  const maxUpPct = Number(params.position.pnl.maxUpPct);
  const takeProfitPercent = Number(params.takeProfitPercent);
  const hasTakeProfitPercent =
    Number.isFinite(takeProfitPercent) && takeProfitPercent >= 0;
  const positiveThresholdPct = normalizeSpeedupPercent(
    params.positivePnlThresholdPct,
    DEFAULT_SPEEDUP_POSITIVE_PNL_THRESHOLD_PCT,
  );
  const negativeThresholdPct = normalizeSpeedupPercent(
    params.negativePnlThresholdPct,
    DEFAULT_SPEEDUP_NEGATIVE_PNL_THRESHOLD_PCT,
  );
  const takeProfitOffsetPct = normalizeSpeedupPercent(
    params.takeProfitOffsetPct,
    DEFAULT_SPEEDUP_TAKE_PROFIT_OFFSET_PCT,
  );

  if (Number.isFinite(netPct) && netPct >= positiveThresholdPct) {
    reasons.push("POSITIVE_PNL_THRESHOLD");
  }
  if (Number.isFinite(netPct) && netPct <= -negativeThresholdPct) {
    reasons.push("NEGATIVE_PNL_THRESHOLD");
  }
  if (
    params.useStopLossPlus !== false &&
    hasTakeProfitPercent &&
    Number.isFinite(maxUpPct) &&
    maxUpPct >= takeProfitPercent
  ) {
    reasons.push("STOP_LOSS_PLUS_ARMED");
  }
  if (
    Number.isFinite(netPct) &&
    hasTakeProfitPercent &&
    netPct >= Math.max(0, takeProfitPercent - takeProfitOffsetPct)
  ) {
    reasons.push("NEAR_TAKE_PROFIT");
  }
  if (
    isApproachingPostAverageTarget({
      latestVolatilityPoint: params.latestVolatilityPoint,
      position: params.position,
      volatilityThresholdPct: params.volatilityThresholdPct,
    })
  ) {
    reasons.push("POST_AVERAGE_TARGET_APPROACH");
  }
  if (
    hasPositionHitTargetVolatilityPoint({
      position: params.position,
      volatilityPoints: params.volatilityPoints ?? [],
    })
  ) {
    reasons.push("TARGET_VPOINT_HIT");
  }

  return reasons;
}

/** Returns whether an averaged position is approaching its target vPoint. */
function isApproachingPostAverageTarget(params: {
  latestVolatilityPoint?: Pick<VolatilityPoint, "p">;
  position: Position;
  volatilityThresholdPct?: number;
}): boolean {
  const averagingExecutions = params.position.strategy.averaging.executions;
  if (!averagingExecutions?.length) {
    return false;
  }

  const volatilityThresholdPct = Number(
    params.volatilityThresholdPct ?? VOLATILITY_THRESHOLD,
  );
  if (!Number.isFinite(volatilityThresholdPct)) {
    return false;
  }

  const favorableDistancePct =
    postAverageRescue.distance.calculateFavorablePercent({
      currentPrice: Number(params.position.pnl.markPrice),
      direction: params.position.direction,
      lastVolatilityPrice: Number(params.latestVolatilityPoint?.p),
    });

  return favorableDistancePct > Math.max(0, volatilityThresholdPct) / 2;
}

/** Returns whether a position belongs to the configured Speedup stage. */
function isSpeedupPosition(params: {
  latestVolatilityPoint?: Pick<VolatilityPoint, "p">;
  negativePnlThresholdPct?: number;
  positivePnlThresholdPct?: number;
  position: Position;
  takeProfitOffsetPct?: number;
  takeProfitPercent?: number;
  useStopLossPlus?: boolean;
  volatilityPoints?: Array<Pick<VolatilityPoint, "l" | "t">>;
  volatilityThresholdPct?: number;
}): boolean {
  return getSpeedupReasons(params).length > 0;
}

/** Selects the mutually exclusive symbols owned by one production stage. */
function selectStageSymbols(params: {
  configuredSymbols: string[];
  modeState: SlowTradingModeState;
  speedupNegativePnlThresholdPct?: number;
  speedupPositivePnlThresholdPct?: number;
  speedupTakeProfitOffsetPct?: number;
  stage: SlowTradingStage;
  takeProfitPercent?: number;
  useStopLossPlus?: boolean;
  volatilityMemoryBySymbol?: Record<
    string,
    { lastVolatility?: VolatilityPoint[] }
  >;
  volatilityThresholdPct?: number;
}): string[] {
  const normalizeSymbol = (value: unknown) =>
    String(value || "")
      .trim()
      .toUpperCase();
  const tradeSettingBySymbol = new Map(
    params.modeState.tradeSettings
      .map(
        (tradeSetting) =>
          [normalizeSymbol(tradeSetting.symbol), tradeSetting] as const,
      )
      .filter(([symbol]) => Boolean(symbol)),
  );

  if (params.stage === "risk-sentinel") {
    return ["BTC"];
  }

  if (params.stage === "capture-entry") {
    // PROD:CAPTURE_ENTRY_STAGE
    return Array.from(
      new Set(params.configuredSymbols.map(normalizeSymbol).filter(Boolean)),
    ).filter(
      (symbol) =>
        (tradeSettingBySymbol.get(symbol)?.model_memory.positions?.length ??
          0) === 0,
    );
  }

  if (params.stage === "management") {
    // PROD:MANAGEMENT_STAGE
    return Array.from(
      new Set(params.configuredSymbols.map(normalizeSymbol).filter(Boolean)),
    );
  }

  return params.modeState.tradeSettings.flatMap((tradeSetting) => {
    const symbol = normalizeSymbol(tradeSetting.symbol);
    const positions = (tradeSetting.model_memory.positions ?? []).filter(
      (position) => !position.closed,
    ) as Position[];
    if (!symbol || positions.length === 0) {
      return [];
    }

    const volatilityPoints =
      params.volatilityMemoryBySymbol?.[symbol]?.lastVolatility ??
      tradeSetting.model_memory.volatility?.lastVolatility ??
      [];
    const latestVolatilityPoint = volatilityPoints.at(-1);
    const isSpeedup = positions.some((position) =>
      isSpeedupPosition({
        latestVolatilityPoint,
        negativePnlThresholdPct: params.speedupNegativePnlThresholdPct,
        positivePnlThresholdPct: params.speedupPositivePnlThresholdPct,
        position,
        takeProfitOffsetPct: params.speedupTakeProfitOffsetPct,
        takeProfitPercent: params.takeProfitPercent,
        useStopLossPlus: params.useStopLossPlus,
        volatilityPoints,
        volatilityThresholdPct: params.volatilityThresholdPct,
      }),
    );
    // PROD:SPEEDUP_STAGE
    // PROD:STANDARD_MONITORING_STAGE
    const belongsToStage = params.stage === "speedup" ? isSpeedup : !isSpeedup;
    return belongsToStage ? [symbol] : [];
  });
}

/** Resolves the configured interval for one production stage. */
function getStageIntervalMinutes(
  runtime: Pick<
    SlowTradingRuntimeConfig,
    | "speedupStageIntervalMinutes"
    | "blackSwanStageIntervalMinutes"
    | "standardMonitoringStageIntervalMinutes"
    | "managementStageIntervalMinutes"
    | "captureEntryStageIntervalMinutes"
  >,
  stage: SlowTradingStage,
): number {
  if (stage === "risk-sentinel") {
    return normalizeIntervalMinutes(
      runtime.blackSwanStageIntervalMinutes,
      DEFAULT_INTERVAL_MINUTES["risk-sentinel"],
    );
  }

  if (stage === "speedup") {
    return normalizeIntervalMinutes(
      runtime.speedupStageIntervalMinutes,
      DEFAULT_INTERVAL_MINUTES.speedup,
    );
  }

  if (stage === "standard-monitoring") {
    return normalizeIntervalMinutes(
      runtime.standardMonitoringStageIntervalMinutes,
      DEFAULT_INTERVAL_MINUTES["standard-monitoring"],
    );
  }

  if (stage === "management") {
    return normalizeIntervalMinutes(
      runtime.managementStageIntervalMinutes,
      DEFAULT_INTERVAL_MINUTES.management,
    );
  }

  return normalizeIntervalMinutes(
    runtime.captureEntryStageIntervalMinutes,
    DEFAULT_INTERVAL_MINUTES["capture-entry"],
  );
}

const slowTradingStages = {
  order: SLOW_TRADING_STAGE_ORDER,
  interval: {
    defaults: DEFAULT_INTERVAL_MINUTES,
    getMinutes: getStageIntervalMinutes,
    normalizeMinutes: normalizeIntervalMinutes,
  },
  position: {
    describeStandardReason,
    describeSpeedupReasons,
    getSpeedupReasons,
    isApproachingPostAverageTarget,
    isSpeedup: isSpeedupPosition,
    reasonLabels: SPEEDUP_REASON_LABELS,
    speedupThreshold: {
      defaults: {
        negativePct: DEFAULT_SPEEDUP_NEGATIVE_PNL_THRESHOLD_PCT,
        positivePct: DEFAULT_SPEEDUP_POSITIVE_PNL_THRESHOLD_PCT,
        takeProfitOffsetPct: DEFAULT_SPEEDUP_TAKE_PROFIT_OFFSET_PCT,
      },
      normalizePct: normalizeSpeedupPercent,
    },
  },
  symbols: {
    select: selectStageSymbols,
  },
} as const;

export default slowTradingStages;
export { slowTradingStages };
