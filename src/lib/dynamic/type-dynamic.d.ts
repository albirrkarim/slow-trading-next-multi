import type { TradingMode } from "../exchange";
import type { BlackSwanConfig } from "../trading/black-swan";
import type { TradingModelConfig } from "../trading/models";

export interface SafeHavenConfig {
  /**
   * Safe haven bucket in USDT.
   *
   * Every month, we move this amount from the total available balance into a safe haven.
   * For example, you might keep some funds aside for real-life expenses.
   *
   * Unit: USDT
   * Example: 20 = $20
   *
   * When undefined, no funds are moved — the balance keeps compounding.
   */
  safeUSDTPerMonth?: number;

  /**
   * Every month, move this percentage of the total asset into a safe haven.
   *
   * For example, if set to 0.2 (20%), it will try to move 20% of your total portfolio value.
   * If some funds are in trades, it will attempt to withdraw from available balance.
   *
   * Unit: Percent (0–1)
   * Example: 0.2 = 20%
   *
   * When undefined, no funds are moved — the balance keeps compounding.
   */
  safePercentPerMonth?: number;

  /**
   * Dont take to much to save, we still need the asset to trade to make profit
   */
  minimalAssetOnTrade?: number;
}

export interface TradingModelConfigDynamic extends SafeHavenConfig {}

export interface AdaptiveAveragingConfig {
  /** Enables searching above the normal watch reserve multiplier. */
  enabled: boolean;

  /** Maximum multiplier considered by the adaptive search. */
  maxMultiplier: number;

  /** Minimum projected profit required at the vPoint-anchored rescue target. */
  minProjectedProfitPct: number;
}

export interface DynamicTradeConfig {
  /**
   * Name of the trading configuration.
   */
  name: string;

  /**
   * Description of the trading configuration.
   */
  description: string;

  /**
   * List of trading symbols (e.g., ["BTC", "ETH"]) that this config applies to.
   */
  symbols: string[];

  /**
   * Trading model parameters used for every run.
   */
  modelConfig: TradingModelConfig;

  /**
   * The version string specifying the decision engine algorithm (e.g., "decision.v14").
   */
  decisionEngineVersion?: string;

  /**
   * The underlying exchange target type (e.g., OKX, TOKOCRYPTO).
   */
  exchangeType: ExchangeType;

  /**
   * The trading mode target (e.g., spot, margin_isolated, futures).
   */
  tradingMode: TradingMode;

  /**
   * When ON, the strategy can run the decision watch logic such as v17 averaging add-position actions.
   * When OFF, it will skip all automatic watch/add-position behavior.
   */
  enableWatchLogic?: boolean;

  /**
   * Limits the reserved balance lock for future watch adds.
   * Does not stop engine.watch from requesting more averaging by itself. Set 0 to disable.
   */
  watchReserveLevels?: number;

  /**
   * Relative cap for automatic averaging. E.g., entry at level 4 and max 2 means watch logic
   * may add on 5 and 6, but not 7. Set 0 to disable.
   */
  watchMaxNextAveragingLevels?: number;

  /**
   * Multiplier applied to the current accumulated margin to calculate the next averaging entry size.
   * Defaults to 2 (matches Fast Trading).
   */
  watchReservePctAlloc?: number;

  /** Controls the optional multiplier search used by adaptive averaging. */
  adaptiveAveraging?: AdaptiveAveragingConfig;

  /**
   * When ON, averaging must improve the weighted entry and satisfy the rescue
   * projection target. Defaults to ON.
   */
  averagingRescueProjectionGuardEnabled?: boolean;

  /**
   * Maximum number of simultaneously open positions in the active mode.
   * Set 0 to disable.
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
   * Maximum percentage of current spendable balance that one entry plus its
   * watch reserve may consume. Set 0 to disable.
   */
  maxEntryMarginPct?: number;

  /**
   * Percent of the coin's 24h quote volume used as the temporary entry sizing
   * budget. This budget must fit the entry plus reserve planning. Set 0 to
   * disable.
   */
  maxEntryBased24HourVolPct?: number;

  /**
   * Fixed account margin budget (USDT) to spend for one entry.
   *
   * This is not the futures notional position size. In futures mode, leverage
   * expands this margin into a larger notional. For example, maxEntryMargin=20
   * with 2x leverage spends about $20 margin and opens about $40 notional.
   *
   * Set 0 to use the engine calculation.
   */
  maxEntryMargin?: number;

  /**
   * Minimum absolute volatility level that a compatible decision engine may
   * treat as immediately actionable. It also controls how close volatility
   * syncing must be to an entry level before using the normal cycle.
   * Default 2; minimum 1.
   */
  minActionableAbsoluteLevel?: number;

  /**
   * Maximum leverage applied for futures trading. Set 0 to use engine calculation.
   */
  maxLeverage?: number;

  /**
   * Exact leverage applied for futures trading, overriding the engine and
   * maximum-leverage caps. Set 0 to use the normal leverage calculation.
   */
  exactLeverage?: number;

  /** Portfolio-wide crash detection, risk freeze, and emergency-exit policy. */
  blackSwan?: BlackSwanConfig;
}

/**
 * Represents the current balance state of the trading account.
 */
export interface DynamicTradeMemory {
  /**
   * startingBalanceUSDT just to remembering what initial money
   */
  startingBalanceUSDT: number;

  /**
   * Quote asset amount in USDT.
   *
   * This is the active balance available for trading operations.
   */
  quoteAsset: number;

  /**
   * Reserved quote asset amount in USDT (used for averaging logic).
   */
  reservedQuoteAsset?: number;

  /**
   * Safe haven balance, also backed by USDT.
   *
   * This represents the portion of funds set aside as a stable reserve —
   * for example, to cover monthly expenses or withdrawals.
   */
  safeHaven: number;

  /**
   * Misal jika safeUSDTPerMonth, atau safePercentPerMonth is defined
   *
   * maka tiap tanggal 1 of the month kalkulasi ini.
   *
   * misal 20 dolar maka pada bulan tersebut algoritma akan mencarikan 20 dolar tersebut.
   *
   * jika tidak bisa maka gpp, tgl 1 berikutnya tetep reset
   */
  safeHavenRequest: number;

  /**
   * ms. when it is on the 1st of the month and lastSafeHavenRequest. is undefined or older than a month
   */
  lastSafeHavenRequest?: number;

  /**
   * Catat ambilnya di sini
   */
  safeHavenHistory: SafeHavenLog[];

  /**
   * Used in dynamic v3.
   * for decision
   */
  volatilitySnapshots: VolatilitySnapshot[];

  /**
   * Used in dynamic v4.
   * for decision
   */
  deltaTimeMap?: Record<string, Record<string, Record<string, any>>>;

  /**
   * One year record or equivalent of 70 volatility point
   */
  priceNormMapOverTime: Record<string, PriceNorm[]>;
}

export interface PriceNorm {
  /** milliseconds */
  t: number;

  /**
   * highest price seen in the window
   */
  x: number;

  /**
   * lowest price seen in the window
   */
  n: number;

  /**
   * current price normalized 0-1
   *
   * maximal two floating points
   * eg: 0.65
   */
  c: number;
}
