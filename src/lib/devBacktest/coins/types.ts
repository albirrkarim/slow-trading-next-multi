import type { VolatilityPoint } from "@/lib/dynamic";

export type CoinFinderRange =
  | "6month"
  | "1year"
  | "2year"
  | "3year"
  | "4year"
  | "5year";

export interface CoinFinderResult {
  avgBottomToTopMs: number | null;
  avgTopToBottomMs: number | null;
  cached: boolean;
  correlationScore: number | null;
  correlations: Record<string, number>;
  entrySequenceCount: number | null;
  entrySignalsPerMonth: number | null;
  firstSeen: number | null;
  healthReasons: string[];
  healthScore: number | null;
  holdDurationAvgMs: number | null;
  holdDurationMaxMs: number | null;
  holdDurationMinMs: number | null;
  maxBottom: number | null;
  maxBottomT: number | null;
  maxBottomToTopMs: number | null;
  maxLevelAbsolute: number | null;
  maxTop: number | null;
  maxTopT: number | null;
  maxTopToBottomMs: number | null;
  marketCapUSD: number | null;
  levelFrequency: Record<string, number>;
  pointCount: number;
  vPointCloseDistanceOccurrences: number;
  vPointPctAvg: number | null;
  vPointPctMax: number | null;
  vPointPctMaxT: number | null;
  vPointPctMin: number | null;
  vPointsPerMonth: number | null;
  vPointTransitionAvgMs: number | null;
  vPointTransitionMaxMs: number | null;
  vPointTransitionMinMs: number | null;
  range: CoinFinderRange;
  symbol: string;
}

export interface CoinFinderJobError {
  message: string;
  symbol: string;
}

export interface CoinFinderJobProgress {
  completed: number;
  currentSymbol: string | null;
  currentSymbolPercent: number;
  stage: "validating" | "processing";
  total: number;
  validationCompleted: number;
  validationTotal: number;
}

export interface CoinFinderJob {
  completedAt?: number;
  createdAt: number;
  errors: CoinFinderJobError[];
  id: string;
  progress: CoinFinderJobProgress;
  range: CoinFinderRange;
  results: CoinFinderResult[];
  status: "queued" | "running" | "completed" | "cancelled";
  symbols: string[];
  useCachedVPoints: boolean;
}

export interface CoinFinderChartData {
  /** Compact [time, open, high, low, close, volume] chart candles. */
  klines: Array<[number, string, string, string, string, string]>;
  points: VolatilityPoint[];
  range: CoinFinderRange;
  symbol: string;
}

export type CoinFinderVolatilityMap = Record<string, VolatilityPoint[]>;
