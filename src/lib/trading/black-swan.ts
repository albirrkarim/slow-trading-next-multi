import type { UnifiedKline } from "@/lib/exchange/types";

export type BlackSwanStatus = "NORMAL" | "WATCH" | "CRISIS" | "RECOVERY";
export type BlackSwanExitPolicy =
  "FREEZE_ONLY" | "CLOSE_ADVERSE" | "FLATTEN_ALL";
export type BlackSwanReason =
  | "DISABLED"
  | "HEALTHY"
  | "DATA_STALE"
  | "BTC_WARNING"
  | "BTC_HARD_TRIGGER"
  | "SYSTEMIC_BREADTH"
  | "COOLDOWN"
  | "MANUAL_ACK_REQUIRED";

export interface BlackSwanConfig {
  enabled: boolean;
  btcWarning: {
    fiveMinuteDrawdownPct: number;
    fifteenMinuteDrawdownPct: number;
  };
  btcHardTrigger: {
    fiveMinuteDrawdownPct: number;
    fifteenMinuteDrawdownPct: number;
    sixtyMinuteDrawdownPct: number;
  };
  breadthConfirmation: {
    windowMinutes: number;
    altDrawdownPct: number;
    affectedSymbolsPct: number;
    minimumValidSymbols: number;
  };
  maxDataAgeMinutes: number;
  exitPolicy: BlackSwanExitPolicy;
  recoveryCooldownMinutes: number;
  requireManualLiveRecovery: boolean;
}

export interface BlackSwanDrawdownEvidence {
  baseline: number;
  current: number;
  low: number;
  pct: number;
  t: number;
}

export interface BlackSwanEvidence {
  btc: Partial<Record<5 | 15 | 60, BlackSwanDrawdownEvidence>>;
  breadth?: {
    affected: number;
    pct: number;
    requiredPct: number;
    thresholdPct: number;
    valid: number;
    windowMinutes: number;
  };
}

/** Persisted, per-mode portfolio protection state. */
export interface BlackSwanState {
  status: BlackSwanStatus;
  reason: BlackSwanReason;
  /** Time when the current status began. */
  since: number;
  /** Most recent detector evaluation time. */
  t: number;
  /** First time healthy evidence was seen after protection activated. */
  recoverySince?: number;
  /** Operator acknowledgement time for live recovery. */
  acknowledgedAt?: number;
  evidence?: BlackSwanEvidence;
}

interface EvaluateBlackSwanParams {
  config: BlackSwanConfig;
  previous?: BlackSwanState;
  currentTimeMs: number;
  btcCandles: UnifiedKline[];
  breadthCandlesBySymbol?: Record<string, UnifiedKline[]>;
  mode: "live" | "sandbox";
}

const MINUTE_MS = 60_000;

export const DEFAULT_BLACK_SWAN_CONFIG: BlackSwanConfig = {
  enabled: false,
  btcWarning: {
    fiveMinuteDrawdownPct: 4,
    fifteenMinuteDrawdownPct: 6,
  },
  btcHardTrigger: {
    fiveMinuteDrawdownPct: 8,
    fifteenMinuteDrawdownPct: 10,
    sixtyMinuteDrawdownPct: 14,
  },
  breadthConfirmation: {
    windowMinutes: 5,
    altDrawdownPct: 8,
    affectedSymbolsPct: 50,
    minimumValidSymbols: 5,
  },
  maxDataAgeMinutes: 2,
  exitPolicy: "CLOSE_ADVERSE",
  recoveryCooldownMinutes: 60,
  requireManualLiveRecovery: true,
};

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, Math.floor(positive(value, fallback)));
}

/** Applies safe defaults to persisted or user-supplied black-swan settings. */
function normalizeConfig(value: unknown): BlackSwanConfig {
  const input =
    value && typeof value === "object"
      ? (value as Partial<BlackSwanConfig>)
      : {};
  const warning: Partial<BlackSwanConfig["btcWarning"]> =
    input.btcWarning ?? {};
  const hard: Partial<BlackSwanConfig["btcHardTrigger"]> =
    input.btcHardTrigger ?? {};
  const breadth: Partial<BlackSwanConfig["breadthConfirmation"]> =
    input.breadthConfirmation ?? {};
  const exitPolicy: BlackSwanExitPolicy = [
    "FREEZE_ONLY",
    "CLOSE_ADVERSE",
    "FLATTEN_ALL",
  ].includes(String(input.exitPolicy))
    ? (input.exitPolicy as BlackSwanExitPolicy)
    : DEFAULT_BLACK_SWAN_CONFIG.exitPolicy;

  return {
    enabled: input.enabled === true,
    btcWarning: {
      fiveMinuteDrawdownPct: positive(
        warning.fiveMinuteDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.btcWarning.fiveMinuteDrawdownPct,
      ),
      fifteenMinuteDrawdownPct: positive(
        warning.fifteenMinuteDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.btcWarning.fifteenMinuteDrawdownPct,
      ),
    },
    btcHardTrigger: {
      fiveMinuteDrawdownPct: positive(
        hard.fiveMinuteDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.btcHardTrigger.fiveMinuteDrawdownPct,
      ),
      fifteenMinuteDrawdownPct: positive(
        hard.fifteenMinuteDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.btcHardTrigger.fifteenMinuteDrawdownPct,
      ),
      sixtyMinuteDrawdownPct: positive(
        hard.sixtyMinuteDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.btcHardTrigger.sixtyMinuteDrawdownPct,
      ),
    },
    breadthConfirmation: {
      windowMinutes: positiveInteger(
        breadth.windowMinutes,
        DEFAULT_BLACK_SWAN_CONFIG.breadthConfirmation.windowMinutes,
      ),
      altDrawdownPct: positive(
        breadth.altDrawdownPct,
        DEFAULT_BLACK_SWAN_CONFIG.breadthConfirmation.altDrawdownPct,
      ),
      affectedSymbolsPct: Math.min(
        100,
        positive(
          breadth.affectedSymbolsPct,
          DEFAULT_BLACK_SWAN_CONFIG.breadthConfirmation.affectedSymbolsPct,
        ),
      ),
      minimumValidSymbols: positiveInteger(
        breadth.minimumValidSymbols,
        DEFAULT_BLACK_SWAN_CONFIG.breadthConfirmation.minimumValidSymbols,
      ),
    },
    maxDataAgeMinutes: positiveInteger(
      input.maxDataAgeMinutes,
      DEFAULT_BLACK_SWAN_CONFIG.maxDataAgeMinutes,
    ),
    exitPolicy,
    recoveryCooldownMinutes: positiveInteger(
      input.recoveryCooldownMinutes,
      DEFAULT_BLACK_SWAN_CONFIG.recoveryCooldownMinutes,
    ),
    requireManualLiveRecovery: input.requireManualLiveRecovery !== false,
  };
}

/** Creates the backward-compatible initial detector state. */
function createState(t = 0): BlackSwanState {
  return {
    status: "NORMAL",
    reason: "DISABLED",
    since: t,
    t,
  };
}

function normalizeState(value: unknown, t = 0): BlackSwanState {
  if (!value || typeof value !== "object") {
    return createState(t);
  }
  const input = value as Partial<BlackSwanState>;
  const status: BlackSwanStatus = [
    "NORMAL",
    "WATCH",
    "CRISIS",
    "RECOVERY",
  ].includes(String(input.status))
    ? (input.status as BlackSwanStatus)
    : "NORMAL";

  return {
    ...input,
    status,
    reason: input.reason ?? "HEALTHY",
    since: Number.isFinite(Number(input.since)) ? Number(input.since) : t,
    t: Number.isFinite(Number(input.t)) ? Number(input.t) : t,
  };
}

/** Calculates closed-candle drawdown without reading candles from the future. */
function calculateDrawdown(params: {
  candles: UnifiedKline[];
  currentTimeMs: number;
  windowMinutes: number;
}): BlackSwanDrawdownEvidence | undefined {
  const closed = params.candles
    .filter((candle) => {
      const openTime = Number(candle[0]);
      const closeTime = Number(candle[6]);
      const effectiveCloseTime = Number.isFinite(closeTime)
        ? closeTime
        : openTime + MINUTE_MS - 1;
      return (
        Number.isFinite(openTime) && effectiveCloseTime <= params.currentTimeMs
      );
    })
    .sort((left, right) => Number(left[0]) - Number(right[0]));
  const latest = closed.at(-1);
  if (!latest) {
    return undefined;
  }

  const latestOpenTime = Number(latest[0]);
  const windowStart = latestOpenTime - params.windowMinutes * MINUTE_MS;
  const candidates = closed.filter((candle) => {
    const openTime = Number(candle[0]);
    return openTime >= windowStart && openTime < latestOpenTime;
  });
  if (candidates.length === 0) {
    return undefined;
  }

  const baseline = Math.max(...candidates.map((candle) => Number(candle[4])));
  const current = Number(latest[4]);
  const low = Math.min(
    Number(latest[3]),
    ...candidates.map((candle) => Number(candle[3])),
  );
  if (!(baseline > 0) || !(current > 0) || !Number.isFinite(low)) {
    return undefined;
  }

  return {
    baseline,
    current,
    low,
    pct: ((current - baseline) / baseline) * 100,
    t: Number(latest[6]) || latestOpenTime + MINUTE_MS - 1,
  };
}

/** Calculates the percentage of valid configured symbols in a crash. */
function calculateBreadth(params: {
  candlesBySymbol: Record<string, UnifiedKline[]>;
  config: BlackSwanConfig["breadthConfirmation"];
  currentTimeMs: number;
  maxDataAgeMinutes: number;
}): BlackSwanEvidence["breadth"] {
  let affected = 0;
  let valid = 0;
  for (const candles of Object.values(params.candlesBySymbol)) {
    const drawdown = calculateDrawdown({
      candles,
      currentTimeMs: params.currentTimeMs,
      windowMinutes: params.config.windowMinutes,
    });
    if (
      !drawdown ||
      params.currentTimeMs - drawdown.t > params.maxDataAgeMinutes * MINUTE_MS
    ) {
      continue;
    }
    valid += 1;
    if (drawdown.pct <= -params.config.altDrawdownPct) {
      affected += 1;
    }
  }

  return {
    affected,
    pct: valid > 0 ? (affected / valid) * 100 : 0,
    requiredPct: params.config.affectedSymbolsPct,
    thresholdPct: params.config.altDrawdownPct,
    valid,
    windowMinutes: params.config.windowMinutes,
  };
}

function transition(
  previous: BlackSwanState,
  status: BlackSwanStatus,
  reason: BlackSwanReason,
  t: number,
  evidence?: BlackSwanEvidence,
): BlackSwanState {
  return {
    status,
    reason,
    since: previous.status === status ? previous.since : t,
    t,
    evidence,
    ...(status === "RECOVERY"
      ? { recoverySince: previous.recoverySince ?? t }
      : {}),
    ...(previous.acknowledgedAt
      ? { acknowledgedAt: previous.acknowledgedAt }
      : {}),
  };
}

/** Evaluates one detector tick from closed candles and prior persisted state. */
function evaluate(params: EvaluateBlackSwanParams): BlackSwanState {
  const config = normalizeConfig(params.config);
  const previous = normalizeState(params.previous, params.currentTimeMs);
  if (!config.enabled) {
    return transition(previous, "NORMAL", "DISABLED", params.currentTimeMs);
  }

  const btc5 = calculateDrawdown({
    candles: params.btcCandles,
    currentTimeMs: params.currentTimeMs,
    windowMinutes: 5,
  });
  const btc15 = calculateDrawdown({
    candles: params.btcCandles,
    currentTimeMs: params.currentTimeMs,
    windowMinutes: 15,
  });
  const btc60 = calculateDrawdown({
    candles: params.btcCandles,
    currentTimeMs: params.currentTimeMs,
    windowMinutes: 60,
  });
  const evidence: BlackSwanEvidence = {
    btc: { 5: btc5, 15: btc15, 60: btc60 },
  };
  const latestT = Math.max(btc5?.t ?? 0, btc15?.t ?? 0, btc60?.t ?? 0);
  if (
    latestT === 0 ||
    params.currentTimeMs - latestT > config.maxDataAgeMinutes * MINUTE_MS
  ) {
    if (previous.status === "CRISIS") {
      return transition(
        previous,
        "CRISIS",
        "DATA_STALE",
        params.currentTimeMs,
        evidence,
      );
    }
    return transition(
      previous,
      "WATCH",
      "DATA_STALE",
      params.currentTimeMs,
      evidence,
    );
  }

  const warning =
    (btc5?.pct ?? 0) <= -config.btcWarning.fiveMinuteDrawdownPct ||
    (btc15?.pct ?? 0) <= -config.btcWarning.fifteenMinuteDrawdownPct;
  const hard =
    (btc5?.pct ?? 0) <= -config.btcHardTrigger.fiveMinuteDrawdownPct ||
    (btc15?.pct ?? 0) <= -config.btcHardTrigger.fifteenMinuteDrawdownPct ||
    (btc60?.pct ?? 0) <= -config.btcHardTrigger.sixtyMinuteDrawdownPct;

  if (warning && params.breadthCandlesBySymbol) {
    evidence.breadth = calculateBreadth({
      candlesBySymbol: params.breadthCandlesBySymbol,
      config: config.breadthConfirmation,
      currentTimeMs: params.currentTimeMs,
      maxDataAgeMinutes: config.maxDataAgeMinutes,
    });
  }
  const breadthCrisis =
    warning &&
    Boolean(evidence.breadth) &&
    (evidence.breadth?.valid ?? 0) >=
      config.breadthConfirmation.minimumValidSymbols &&
    (evidence.breadth?.pct ?? 0) >=
      config.breadthConfirmation.affectedSymbolsPct;

  if (hard || breadthCrisis) {
    return transition(
      previous,
      "CRISIS",
      hard ? "BTC_HARD_TRIGGER" : "SYSTEMIC_BREADTH",
      params.currentTimeMs,
      evidence,
    );
  }
  if (warning) {
    return transition(
      previous,
      "WATCH",
      "BTC_WARNING",
      params.currentTimeMs,
      evidence,
    );
  }

  if (previous.status === "NORMAL") {
    return transition(
      previous,
      "NORMAL",
      "HEALTHY",
      params.currentTimeMs,
      evidence,
    );
  }

  const recovering = transition(
    previous,
    "RECOVERY",
    "COOLDOWN",
    params.currentTimeMs,
    evidence,
  );
  const cooldownComplete =
    params.currentTimeMs - (recovering.recoverySince ?? params.currentTimeMs) >=
    config.recoveryCooldownMinutes * MINUTE_MS;
  const needsManualAck =
    params.mode === "live" && config.requireManualLiveRecovery;
  const hasManualAck =
    !needsManualAck ||
    (recovering.acknowledgedAt ?? 0) >=
      (recovering.recoverySince ?? params.currentTimeMs);
  if (cooldownComplete && hasManualAck) {
    return transition(
      recovering,
      "NORMAL",
      "HEALTHY",
      params.currentTimeMs,
      evidence,
    );
  }

  return {
    ...recovering,
    reason: cooldownComplete ? "MANUAL_ACK_REQUIRED" : "COOLDOWN",
  };
}

/** Returns true whenever entries and averaging must remain blocked. */
function isProtective(state: BlackSwanState | undefined): boolean {
  return Boolean(state && state.status !== "NORMAL");
}

/** Records an operator acknowledgement without bypassing the cooldown. */
function acknowledge(
  state: BlackSwanState | undefined,
  t = Date.now(),
): BlackSwanState {
  return {
    ...normalizeState(state, t),
    acknowledgedAt: t,
    t,
  };
}

/** Selects exposure reduced by the first-version downward-crisis policy. */
function shouldEmergencyClose(params: {
  direction: "LONG" | "SHORT";
  exitPolicy: BlackSwanExitPolicy;
  tradingMode: string;
}): boolean {
  if (params.exitPolicy === "FREEZE_ONLY") {
    return false;
  }
  if (params.exitPolicy === "FLATTEN_ALL") {
    return true;
  }
  return params.tradingMode === "spot" || params.direction === "LONG";
}

const blackSwan = {
  config: {
    defaults: DEFAULT_BLACK_SWAN_CONFIG,
    normalize: normalizeConfig,
  },
  state: {
    acknowledge,
    create: createState,
    isProtective,
    normalize: normalizeState,
  },
  detector: {
    calculateBreadth,
    calculateDrawdown,
    evaluate,
  },
  emergency: {
    shouldClose: shouldEmergencyClose,
  },
} as const;

export default blackSwan;
