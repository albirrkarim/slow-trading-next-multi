import { type FetchKlinesFunction } from "@lib/datasets/type";
import type {
  TradeDecisionFunction,
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { ExchangeType, TradingMode } from "../exchange";

/**
 * Interface representing the balance of the account.
 */
export interface InitialBalance {
  /** Quote asset amount (e.g. USDT, BNB) */
  quoteAsset: number;

  /** Base asset amount (e.g. BTC, ETH, SOL) */
  baseAsset: number;

  /** Total balance in quote currency (if applicable) */
  total?: number;
}

/**
 * Configuration for executing a trading cycle.
 */
export interface TradingConfig {
  modelMemory: TradingModelMemory;

  modelConfig: TradingModelConfig;

  /** Trading pair symbol, e.g., "BTC_USDT", "ETH_USDT" */
  symbol: string;

  /**
   * When defined its for BackTest, when not its real cronjob server (prod)
   */
  current?: Kline;

  fetchKlines?: FetchKlinesFunction;

  getTradingDecisionFunction: TradeDecisionFunction;

  /** (Optional) Used only for backtesting or simulation */
  balance?: InitialBalance;

  exchangeType?: ExchangeType;
  tradingMode?: TradingMode;
}

export interface TradingDetail {
  /**
   * BTC, SUI
   */
  baseAssetSymbol: string;

  /**
   * Final balance in quote currency (e.g. USDT) after completing the trading cycle.
   */
  finalBalance: number;

  /**
   * Minus when we buy (-20) and positive when we sell (20)
   */
  usdtSpent: number;

  /**
   * Trading Action
   */
  action: "BUY" | "SELL" | "SHORT";

  /**
   * Total trading fees incurred during buy and sell orders in quote currency. (USDT)
   */
  totalFee: number;

  /**
   * Total tax paid on sell transactions in quote currency. (USDT)
   */
  totalTax: number;

  /**
   * USDT
   * Net profit earned from this trading cycle in quote currency.
   *
   * This is calculated after deducting fees and taxes.
   */
  totalProfit: number;

  /**
   * Net profit or loss in percentage
   *
   * 2% = 2
   */
  totalProfitPercent: number;
}

export type TradingAction = "BUY" | "SELL" | "HOLD" | "SHORT";

/**
 * Result of a single trading execution cycle, either in backtest or live mode.
 *
 * This interface captures the financial outcome and position status after a trade
 * has been executed based on the strategy decision (BUY, SELL, or HOLD).
 */
export interface TradingReturn {
  symbol?: string;

  /**
   * Trading Action
   */
  action?: TradingAction;

  /**
   * Decision log
   */
  message: string;

  tradingDetail?: TradingDetail;

  /**
   * Something from tokocrypto API
   */
  tradingResult?: any;
}
