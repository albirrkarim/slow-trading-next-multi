import type { TradeSettings } from "@/components/api/dynamic";
import type { EntryRecommendation } from "@/lib/brain";
import type { DynamicTradeMemory, VolatilityPoint } from "@/lib/dynamic";
import type { ExchangeType, getExchange, TradingMode } from "@/lib/exchange";
import type { TradingModelConfig, TradingModelMemory } from "@/lib/trading/models";
import type { TradingReturn } from "@/lib/trading";
import type { DailyPnlLimitEvaluation } from "../daily-pnl-limit";
import type {
  SlowTradingCyclePerformanceEntry,
  SlowTradingCyclePerformanceObserver,
  SlowTradingCycleProfiler,
} from "../performance";
import type { SlowTradingSkippedEntrySignal } from "../shared";
import type {
  SlowTradingMode,
  SlowTradingModeState,
  SlowTradingStage,
  SlowTradingStorageData,
} from "../types";

export interface RunSlowTradingCycleParams {
  /** Immutable account slug. Omit to run every eligible account sequentially. */
  account?: string;
  bypass?: boolean;
  ignoreRunnerEnabled?: boolean;
  forceExitSymbols?: string[];
  forceEntrySymbols?: string[];
  disableAutoEntry?: boolean;
  stage?: SlowTradingStage;
  performance?: SlowTradingCyclePerformanceObserver;
}

export interface SlowTradingCycleResult {
  mode: SlowTradingMode;
  stage?: SlowTradingStage;
  symbols: string[];
  reports: TradingReturn[];
  executedEntrySignals: number;
  skippedEntrySignals: SlowTradingSkippedEntrySignal[];
  availableQuoteAsset: number;
  lastRunAt?: number;
  lastRunDurationMs?: number;
  skipped?: boolean;
}

export interface SlowTradingCyclePlan {
  blackSwanProtectionActive: boolean;
  bypass: boolean;
  dailyPnlLimitEvaluation: DailyPnlLimitEvaluation;
  dailyPnlLimitThresholdUsdt: number;
  forcedEntrySymbols: Set<string>;
  forcedExitSymbols: Set<string>;
  monitoringReasonByPosition: Record<string, string>;
  monitoringStage?: "speedup" | "standard";
  shouldAutoEnter: boolean;
  shouldAutoExit: boolean;
  shouldCaptureEntry: boolean;
  shouldMonitor: boolean;
  stage?: SlowTradingStage;
  stageSymbols: string[] | null;
}

export interface SlowTradingCycleRuntime extends SlowTradingCyclePlan {
  activeMode: SlowTradingMode;
  currentTimeMs: number;
  cycleStartedAt: number;
  dynamicTradeMemory: DynamicTradeMemory;
  entrySignals: EntryRecommendation[];
  exchange: ReturnType<typeof getExchange>;
  exchangeType: ExchangeType;
  isSandbox: boolean;
  marketType: "SPOT" | "FUTURES";
  modelConfig: TradingModelConfig;
  modelMemoryMap: Record<string, TradingModelMemory>;
  modeState: SlowTradingModeState;
  performanceEntries: SlowTradingCyclePerformanceEntry[];
  profiler: SlowTradingCycleProfiler;
  reports: TradingReturn[];
  skippedEntrySignals: SlowTradingSkippedEntrySignal[];
  storage: SlowTradingStorageData;
  symbols: string[];
  tradeSettings: TradeSettings[];
  tradingMode: TradingMode;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
}
