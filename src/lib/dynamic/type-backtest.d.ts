import type {
    TradeHistoryDetail,
    TradeHistorySimple,
    TradePositionHistory,
} from "@/lib/dynamic/backtest-volatility/type";
import { type IntervalKlines } from "@/lib/exchange/platform/tokocrypto";
import type { TradingMode } from "@/lib/exchange/types";
import type { DynamicTradeAlgorithm } from "../brain/algorithms";
import type { DataBacktestPurpose, DecisionEngineProps, EntryRecommendation } from "../brain/algorithms/type-execute";
import type { EventPosition, TradingModelConfig } from "@/lib/trading/models";
import type {
    AdaptiveAveragingConfig,
    DynamicTradeMemory,
} from "./type-dynamic";
import type { VolatilityPoint } from "./utils/volatility";

interface VolatilityEventPosition extends EventPosition {
    exitLevel: number;
}

/**
 * to memoize the Decision of decisionEngine
 */
export interface TradeHistoryVolatility {
    /**
     * BTC, ETH
     */
    symbol: string;
    message: string;

    // entry
    entryId: string;
    entryFeature: any;
    entryLevel: number;
    entryTime: number;
    entryTimeHuman?: string;
    entryPrice: number;

    // buy info
    quantity: number;
    usdtInvested: number;

    // exit
    holdDurationTime?: number;
    holdDurationHuman?: string;
    exitId?: string;
    exitLevel?: number;
    exitTime?: number;
    exitTimeHuman?: string;
    exitPrice?: number;

    netProfitUSDT?: number;
    netProfitPercent?: number;
}


/**
 * Configuration options for running a backtest simulation on historical trading data.
 */
export interface BacktestConfigDynamic {
    /**
     * Model Trading config
     */
    modelConfig: TradingModelConfig;

    /**
     * The amount of USDT available at the start of the backtest.
     */
    startingBalanceUSDT: number;

    /**
     * 12 mean history klines suplied to trading model is one hour data because
     *
     * the dataset of klines is every 5 minutes so
     *
     * 5 * 12 mean = 60 minutes / one hour history klines
     */
    countLastRecord?: number;

    tradingMode: TradingMode;

    /**
     * Maximum leverage applied for futures backtest. Set 0 to use engine calculation.
     */
    maxLeverage?: number;

    /**
     * Minimum absolute volatility level that a compatible decision engine may
     * treat as immediately actionable. Consumed by decision.v19 and v20.
     * Default 2; minimum 1.
     */
    minActionableAbsoluteLevel?: number;

    /**
     * Exact leverage applied for futures backtest. Set 0 to use the normal
     * engine and maximum-leverage calculation.
     */
    exactLeverage?: number;

    /**
    * Margin Mode
    * Default: ISOLATED
    */
    marginMode?: "ISOLATED" | "CROSS";

    /**
     * When ON, backtest reserves balance for future averaging and executes watch adds.
     */
    enableWatchLogic?: boolean;

    /**
     * Number of future watch levels to reserve for.
     */
    watchReserveLevels?: number;

    /**
     * Maximum number of next volatility levels that can trigger averaging.
     */
    watchMaxNextAveragingLevels?: number;

    /**
     * Multiplier used to size each reserved averaging step.
     */
    watchReservePctAlloc?: number;

    /** Adaptive multiplier-search settings used by averaging. */
    adaptiveAveraging?: AdaptiveAveragingConfig;

    /**
     * When ON, averaging must improve the weighted entry and satisfy the rescue
     * projection target. Defaults to ON.
     */
    averagingRescueProjectionGuardEnabled?: boolean;

    /**
     * Maximum number of simultaneously open positions in the simulated
     * portfolio. Set 0 to disable.
     */
    maxOpenPositions?: number;

    /**
     * When ON, a sideways open position can be force-exited for a strong
     * candidate: either to free a worker for a faster tier, or after the
     * position has stayed sideways for at least two days and the candidate is
     * equal-or-better tier.
     */
    exitSidewaysToFreeWorkersForStrongCandidates?: boolean;

    /**
     * Percent cap for entry plus reserve budget. Set 0 to disable.
     */
    maxEntryMarginPct?: number;

    /**
     * Percent of 24h quote volume used as the temporary entry sizing budget.
     * Set 0 to disable.
     */
    maxEntryBased24HourVolPct?: number;

    /**
     * Fixed margin cap per new entry. Set 0 to disable.
     */
    maxEntryMargin?: number;
}

interface SafeHavenLog {
    timeMs: number;

    timeHuman: string;

    /**
     * amount of usdt we take from currentBalance to the save haven
     */
    amount: number;

    /**
     * remaining usdt that we should take
     */
    remainingRequest: number;

    /**
     * Current quote after we take
     */
    remainingQuote: number;
}

/**
 * The summary result of a completed backtest, including financial outcomes and trade log.
 */
export interface BacktestReturnDynamic {
    symbols: string[];

    range?: string;

    config: BacktestConfigDynamic;

    startingBalanceUSDT: number;

    /**
     * The total USDT balance remaining at the end of the simulation after all trades.
     */
    finalBalance: number;

    dynamicTradeMemory: DynamicTradeMemory;

    /**
     * The total number of trades executed during the backtest.
     */
    totalTrades: number;

    backtestPack: DataBacktestPurpose;

    /**
     * Used in displaying the decision?
     */
    // decisionMarkers: LeveledMarkers[];

    // modelMemoryOvertime: Record<string, any>;
}

/**
 * Represents the record of a single trade event that occurred during backtesting.
 */
export interface TradeHistoryDynamic
    extends TradeHistorySimple,
    TradeHistoryDetail,
    TradePositionHistory {
    // For ploting
    // lastVolatilityPoint?: VolatilityPoint;
}

export interface RunBacktestDynamicProps {
    /**
     *  "ETH", "DOGE", ""
     *
     *  coins that be use as the options
     */
    symbols: string[];

    interval?: IntervalKlines;

    range?: string;

    startTime?: number;
    endTime?: number;

    /** Stops a demand-only simulation after its requesting client disconnects. */
    signal?: AbortSignal;

    /** Reuses compact volatility files when true. */
    useVolatilityCache?: boolean;

    /**
     * Preloaded volatility points. When supplied, the runner simulates exactly
     * this visible/ranged dataset and does not load volatility files.
     */
    volatilityMap?: Record<string, VolatilityPoint[]>;

    /**
     * Optional pre-range warmup points used to seed price normalization.
     * Falls back to volatilityMap when omitted.
     */
    warmupVolatilityMap?: Record<string, VolatilityPoint[]>;

    /**
     * Runtime-only 24h quote-volume map. Quick/live backtests can pass the
     * dashboard ticker snapshot here without persisting it into strategy config.
     */
    volume24hBySymbol?: Record<string, number>;

    /**
     * Duration before the dataset end where new entries are blocked. Dynamic
     * research backtests keep a buffer; quick visible-range simulations can set
     * it to 0 so short dashboard ranges still trade.
     */
    entryCutoffBufferMs?: number;

    config: BacktestConfigDynamic;

    decisionEngine?: (params: DecisionEngineProps) => EntryRecommendation[];

    verbose?: boolean;
}

/**
 * The summary result of a completed backtest, including financial outcomes and trade log.
 */
export interface BacktestReturnDynamic {
    symbols: string[];

    range?: string;

    config: BacktestConfigDynamic;

    startingBalanceUSDT: number;

    /**
     * The total USDT balance remaining at the end of the simulation after all trades.
     */
    finalBalance: number;

    dynamicTradeMemory: DynamicTradeMemory;

    /**
     * The total number of trades executed during the backtest.
     */
    totalTrades: number;

    backtestPack: DataBacktestPurpose;

    /**
     * Used in displaying the decision?
     */
    // decisionMarkers: LeveledMarkers[];

    // modelMemoryOvertime: Record<string, any>;
}


export interface CacheId {
    symbols: string[];
    range: string;
    config: BacktestConfigDynamic;

    algorithm: DynamicTradeAlgorithm;
    startTime?: number;
    endTime?: number;
    mode: string;
}
