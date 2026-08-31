import { type VolatilityPoint } from "./volatility";

/**
 * Attached to model memory
 */
export interface PredictionEngineMemory {
  /**
   * BTC_USDT
   *
   * ETH_USDT
   */
  symbol: string;

  /**
   * Last volatility points
   */
  lastVolatility: VolatilityPoint[];

  /**
   * Time of the last completed volatility-point kline sync in milliseconds.
   * Used to reduce low-level refresh work while preserving the normal refresh
   * cycle near entry levels.
   */
  vPointLastUpdate?: number;

  predict?: {
    entry: PredictionAction;
    tp: PredictionAction;
  };
}

interface PredictionAction {
  /**
   * Unix
   */
  dateMs: number;

  /**
   * ISO string
   */
  dateHuman: string;

  /**
   * 0.3 // 0-1 how confident it will entry
   */
  confident: number;
}
