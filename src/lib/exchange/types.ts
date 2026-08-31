import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { IntervalKlines } from "@/lib/exchange/platform/tokocrypto/market/klines";

export type { IntervalKlines };

/**
 * Supported exchange types
 */
export type ExchangeType = "okx" | "tokocrypto" | "binance";

/**
 * Unified order side
 */
export enum UnifiedOrderSide {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Unified order type
 */
export enum UnifiedOrderType {
  /**
   * Market Order (Speed)
   *
   * Execute immediately at the best available market price.
   * - **Pros:** Guaranteed execution (fills immediately).
   * - **Cons:** Price slippage (final price may be worse than expected).
   * - **Use when:** You need to buy/sell *now* and price is secondary.
   */
  MARKET = "MARKET",

  /**
   * Limit Order (Control)
   *
   * Execute only at a specific price or better.
   * - **Pros:** Guaranteed price (no slippage).
   * - **Cons:** No guaranteed execution (order may never fill).
   * - **Use when:** You want a specific price and can wait.
   */
  LIMIT = "LIMIT",
  STOP_LIMIT = "STOP_LIMIT",
  STOP_MARKET = "STOP_MARKET",
  TAKE_PROFIT_LIMIT = "TAKE_PROFIT_LIMIT",
  TAKE_PROFIT_MARKET = "TAKE_PROFIT_MARKET",
}

/**
 * Trading mode for exchanges that support multiple modes.
 *
 * Different trading modes allow you to trade cryptocurrencies in different ways,
 * each with their own risks, benefits, and use cases.
 *
 * @example
 * ```typescript
 * // Use spot trading (safest, recommended for beginners)
 * const exchange = getExchange("okx", {
 *   defaultTradingMode: TradingMode.SPOT
 * });
 *
 * // Or specify per order
 * await exchange.createOrder({
 *   symbol: "BTC_USDT",
 *   side: UnifiedOrderSide.BUY,
 *   type: UnifiedOrderType.MARKET,
 *   quoteOrderQty: 100,
 *   tradingMode: TradingMode.SPOT
 * });
 * ```
 */
export enum TradingMode {
  /**
   * Spot Trading (Default - Recommended for Beginners)
   *
   * **What it is:** Regular trading where you buy and sell actual cryptocurrencies
   * using only the money you have in your account. No borrowing, no leverage.
   *
   * **How it works:**
   * - You buy BTC with your USDT → You own actual BTC
   * - You sell BTC → You get actual USDT
   * - You can only trade with money you actually have
   *
   * **Key Features:**
   * - ✅ Safest trading mode (no liquidation risk)
   * - ✅ You own the actual coins
   * - ✅ Can withdraw coins to your wallet
   * - ✅ No interest fees
   * - ❌ Cannot short (bet against price going down)
   * - ❌ Cannot use leverage (amplify gains/losses)
   *
   * **Best for:**
   * - Beginners learning to trade
   * - Long-term investors
   * - People who want to actually own cryptocurrencies
   * - Low-risk trading strategies
   *
   * **Example:**
   * ```typescript
   * // You have $1000 USDT, buy 0.02 BTC at $50,000
   * // You now own 0.02 BTC, have $0 USDT
   * // If BTC goes to $60,000, you can sell for $1,200 (20% profit)
   * // If BTC goes to $40,000, you can sell for $800 (20% loss)
   * // Maximum loss: Your initial $1000 (if BTC goes to $0)
   * ```
   *
   * **Risk Level:** ⭐ Low (1/5)
   */
  SPOT = "spot",

  /**
   * Cross Margin Trading (Advanced - Use with Caution)
   *
   * **What it is:** Trading with borrowed money (margin) where all your assets
   * in the margin account can be used as collateral. If one position fails,
   * other positions can be liquidated to cover losses.
   *
   * **How it works:**
   * - You deposit $1000 USDT as collateral
   * - Exchange lends you $2000 more (2x leverage)
   * - You can now trade with $3000 total
   * - All your margin account assets are at risk if any position fails
   *
   * **Key Features:**
   * - ✅ Can use leverage (borrow money to trade more)
   * - ✅ Can short (bet against price going down)
   * - ✅ More flexible than isolated margin
   * - ❌ High risk - can lose more than you deposit
   * - ❌ All positions share the same collateral pool
   * - ❌ One bad trade can liquidate all your positions
   * - ❌ Interest fees on borrowed funds
   *
   * **Best for:**
   * - Experienced traders
   * - Diversified portfolios where you want shared collateral
   * - Traders comfortable with high risk
   *
   * **Example:**
   * ```typescript
   * // You deposit $1000 USDT, get 2x leverage = $2000 to trade
   * // Buy 0.04 BTC at $50,000 (using $2000)
   * // If BTC goes to $60,000: You make $800 (80% profit on $1000)
   * // If BTC goes to $40,000: You lose $800 (80% loss on $1000)
   * // If BTC goes to $37,500: You get liquidated (lose everything)
   * ```
   *
   * **Risk Level:** ⭐⭐⭐⭐ High (4/5)
   *
   * **⚠️ Warning:** Only use if you understand liquidation risks and can afford to lose your entire margin account.
   */
  MARGIN_CROSS = "margin_cross",

  /**
   * Isolated Margin Trading (Advanced - Use with Caution)
   *
   * **What it is:** Trading with borrowed money (margin) where each position
   * has its own isolated collateral. If one position fails, only that position's
   * collateral is lost - other positions are protected.
   *
   * **How it works:**
   * - You deposit $1000 USDT as collateral for Position A
   * - Exchange lends you $2000 more (2x leverage) for Position A
   * - You can have Position B with separate $500 collateral
   * - If Position A fails, Position B is safe
   *
   * **Key Features:**
   * - ✅ Can use leverage (borrow money to trade more)
   * - ✅ Can short (bet against price going down)
   * - ✅ Each position is isolated - safer than cross margin
   * - ✅ Can limit losses to specific positions
   * - ❌ High risk - can lose more than you deposit per position
   * - ❌ Interest fees on borrowed funds
   * - ❌ Less capital efficient than cross margin
   *
   * **Best for:**
   * - Experienced traders who want position isolation
   * - Risk management (limiting exposure per trade)
   * - Testing strategies without risking entire account
   *
   * **Example:**
   * ```typescript
   * // Position A: Deposit $1000, get 2x leverage = $2000 to trade BTC
   * // Position B: Deposit $500, get 3x leverage = $1500 to trade ETH
   * // If BTC trade fails and gets liquidated, you lose $1000
   * // But your ETH position with $500 is still safe
   * ```
   *
   * **Risk Level:** ⭐⭐⭐⭐ High (4/5)
   *
   * **⚠️ Warning:** Safer than cross margin, but still high risk. Only use if you understand liquidation risks.
   */
  MARGIN_ISOLATED = "margin_isolated",

  /**
   * Futures Trading (Advanced - Highest Risk)
   *
   * **What it is:** Trading contracts that represent future prices of cryptocurrencies.
   * You don't own the actual coins - you're trading price movements. Supports very
   * high leverage (often 10x, 25x, 50x, or even 100x).
   *
   * **⏰ TIME WINDOW / EXPIRATION:**
   * **YES! Futures contracts have expiration dates.** This is a critical difference from spot trading.
   *
   * **Types of Futures Contracts:**
   *
   * 1. **Perpetual Futures (Most Common)**
   *    - No expiration date - can hold indefinitely
   *    - BUT: You pay funding fees every 8 hours (usually)
   *    - Funding fees keep the contract price close to spot price
   *    - Most popular type on crypto exchanges
   *    - Example: BTC-USDT-PERP (perpetual)
   *
   * 2. **Quarterly/Delivery Futures**
   *    - Have specific expiration dates (e.g., end of quarter)
   *    - Must close or roll over before expiration
   *    - At expiration: Settled at spot price or physical delivery
   *    - Example: BTC-USDT-240329 (expires March 29, 2024)
   *
   * 3. **Weekly/Monthly Futures**
   *    - Shorter expiration periods (weekly or monthly)
   *    - More frequent rollover needed
   *    - Example: BTC-USDT-240315 (expires March 15, 2024)
   *
   * **What Happens at Expiration?**
   * - **Perpetual:** Nothing - they never expire, but you pay funding fees
   * - **Delivery Futures:** Contract settles at the spot price at expiration time
   * - **Physical Delivery:** You receive actual coins (rare in crypto)
   * - **Cash Settlement:** Profit/loss is calculated and added/subtracted from your balance
   *
   * **How it works:**
   * - You buy a futures contract for BTC at $50,000
   * - If BTC goes to $60,000, you profit $10,000 per contract
   * - If BTC goes to $40,000, you lose $10,000 per contract
   * - You can use very high leverage (10x, 25x, 50x, 100x)
   * - Contracts expire or are settled periodically (unless perpetual)
   * - Perpetual contracts charge funding fees every 8 hours
   *
   * **Key Features:**
   * - ✅ Can use very high leverage (10x to 100x)
   * - ✅ Can short easily (bet against price)
   * - ✅ No need to own actual cryptocurrencies
   * - ✅ Can trade with smaller capital
   * - ✅ Perpetual futures don't expire (but have funding fees)
   * - ❌ Extremely high risk - can lose everything quickly
   * - ❌ Very easy to get liquidated
   * - ❌ Funding fees (periodic payments on perpetual contracts)
   * - ❌ Expiration dates on delivery futures (must manage)
   * - ❌ Don't own actual coins (unless physical delivery)
   * - ❌ Complex settlement mechanisms
   *
   * **Best for:**
   * - Professional traders
   * - Speculators comfortable with extreme risk
   * - Hedging strategies
   * - Day traders with experience
   * - Traders who can monitor positions regularly
   *
   * **Example - Perpetual Futures:**
   * ```typescript
   * // You deposit $1000, use 10x leverage = $10,000 position
   * // Buy 1 BTC perpetual futures contract at $50,000
   * // If BTC goes to $51,000: You make $1,000 (100% profit on $1000)
   * // If BTC goes to $49,000: You lose $1,000 (100% loss on $1000)
   * // Every 8 hours: You pay funding fee (usually 0.01-0.1% of position)
   * // No expiration: Can hold as long as you want (but keep paying fees)
   * ```
   *
   * **Example - Quarterly Futures:**
   * ```typescript
   * // You buy BTC quarterly futures expiring March 29, 2024
   * // Contract price: $50,000
   * // On March 29, 2024 at 8:00 AM UTC: Contract expires
   * // Settlement: If BTC spot price is $55,000, you profit $5,000 per contract
   * // You must close or roll over before expiration, or it auto-settles
   * ```
   *
   * **Risk Level:** ⭐⭐⭐⭐⭐ Extreme (5/5)
   *
   * **⚠️ Warning:** Extremely risky. Most beginners lose money. Only use if you:
   * - Fully understand futures contracts and expiration mechanics
   * - Understand liquidation mechanics
   * - Can afford to lose 100% of your capital
   * - Have experience with lower-risk trading modes
   * - Have a solid risk management strategy
   * - Can monitor positions regularly (especially for delivery futures)
   * - Understand funding fees (for perpetual contracts)
   *
   * **💡 Pro Tip:** Most crypto exchanges use perpetual futures by default.
   * Always check if your contract is perpetual or has an expiration date!
   */
  FUTURES = "futures",
}

/**
 * Unified order parameters
 * Normalized format for all exchanges
 */
export interface UnifiedOrderParams {
  /** Trading pair symbol in normalized format (e.g., "BTC_USDT") */
  symbol: string;

  /**
   * Trade type: ENTRY or EXIT
   */
  tradeType: "ENTRY" | "EXIT";

  /** Order side: BUY or SELL */
  side: UnifiedOrderSide;

  /** Order type: MARKET or LIMIT */
  type: UnifiedOrderType;

  /**
   * For spot
   * Quantity of base asset to trade (for MARKET SELL or LIMIT orders)
   *
   * For futures:
   * - ENTRY: base quantity
   * - EXIT: contract quantity
   */
  quantity?: number;

  /** Quantity in quote asset to spend (for MARKET BUY only) */
  quoteOrderQty?: number;

  /** Price per unit (required for LIMIT orders) */
  price?: number;

  /** Stop price (trigger price) for STOP orders */
  stopPrice?: number;

  /** Client-defined order ID (optional) */
  clientId?: string;

  /** Trading mode: spot, margin, or futures (optional, defaults to spot) */
  tradingMode?: TradingMode;

  /** Reduce Only (for keeping position from increasing, or auto-repay in Margin) */
  reduceOnly?: boolean;

  /** Position Side (required for Long/Short mode in Margined/Futures) */
  positionSide?: "long" | "short" | "net";

  /**
   * Close entire position
   * If true, quantity is ignored and full position is closed
   */
  closePosition?: boolean;
}

/**
 * Unified order response
 * Normalized format for all exchanges
 */
export interface UnifiedOrderResponse {
  /** Exchange-assigned order ID */
  orderId: string;

  /** Client order ID if provided */
  clientId?: string;

  /** Trading pair symbol */
  symbol: string;

  /** Order side */
  side: UnifiedOrderSide;

  /** Order type */
  type: UnifiedOrderType;

  /** Order status */
  status: string;

  /**
   * Target price for the order TP or SL
   */
  targetPrice: number;

  /**
   * Original order quantity (contracts or base asset)
   */
  quantity: number;

  /** Executed quantity */
  executedQty: number;

  /** Average execution price */
  executedPrice: number;

  /** Transaction time in milliseconds */
  time: number;

  /** Trading mode */
  tradingMode?: TradingMode;

  /** Position side (for futures) */
  positionSide?: "LONG" | "SHORT" | "NET";

  /** Raw response from exchange (for debugging) */
  raw?: any;
}

/** Unified request for withdrawing one asset through an exchange adapter. */
export interface UnifiedWithdrawAssetParams {
  /** Asset symbol to withdraw, for example USDT. */
  asset: string;
  /** Destination wallet address. */
  address: string;
  /** Asset amount to withdraw. */
  amount: number;
  /** Optional exchange network code, for example BSC or TRX. */
  network?: string;
  /** Optional client-side withdrawal id for idempotency/audit. */
  clientWithdrawId?: string;
}

/** Unified response returned after an exchange accepts a withdrawal request. */
export interface UnifiedWithdrawAssetResponse {
  /** Exchange withdrawal id. */
  id: string;
  /** Raw exchange response for diagnostics. */
  raw?: unknown;
}

/**
 * Unified kline parameters
 */
export interface UnifiedGetKlinesParams {
  /** Trading pair symbol in normalized format (e.g., "BTC_USDT") */
  symbol: string;

  /** Kline interval */
  interval: IntervalKlines;

  /** Start time in milliseconds */
  startTime?: number;

  /** End time in milliseconds */
  endTime?: number;

  /**
   * Simple time range (e.g., "10minute", "2week").
   * Automatically calculates startTime based on endTime (or now).
   */
  simpleTime?: string;

  /** Number of klines to fetch */
  limit?: number;

  /** Market type: SPOT or FUTURES */
  marketType?: "SPOT" | "FUTURES";
}

/**
 * Unified balance format
 * Uses existing InitialBalance type
 */
export type UnifiedBalance = {
  /**
   * Quote asset amount (e.g. USDT, BNB)
   */
  quoteAsset: number;

  /**
   * Base asset amount (e.g. BTC, ETH, SOL)
   */
  baseAsset: number;

  /**
   * FUTURE
   * Total balance in quote currency (if applicable)
   */
  total?: number;

  /**
   * FUTURE
   * Frozen balance in quote currency (if applicable)
   */
  frozen?: number;

  /**
   * FUTURE
   * Available balance in quote currency (if applicable)
   */
  available?: number;
};

/**
 * Unified Ticker info
 */
export interface UnifiedTicker {
  /**
   * Coin name
   * AVAX
   * BTC
   */
  coin: string;

  /**
   * okx, binance
   */
  exchange: ExchangeType;

  /** Symbol in normalized format */
  symbol: string;
  /** Last traded price */
  lastPrice: number;
  /** 24h open price */
  open24h: number;
  /** 24h percentage change (e.g. 5.5 for 5.5%) */
  changePercent: number;
  /** 24h volume in Quote currency (usually) */
  volume: number;
  /** High price in last 24h */
  high24h: number;
  /** Low price in last 24h */
  low24h: number;

  /**
   * Market Cap
   */
  marketCap: number;

  /**
   * Historical klines for the ticker (optional)
   */
  klines?: Kline[];
}

/** Latest perpetual-futures funding data normalized across exchanges. */
export interface UnifiedFundingRate {
  /** Exchange-normalized pair, for example `BTC_USDT`. */
  symbol: string;
  /** Funding rate as a decimal, where `0.0001` means `0.01%`. */
  rate: number;
  /** Exchange timestamp for this funding-rate snapshot. */
  t: number;
  /** Next scheduled funding timestamp when supplied by the exchange. */
  nextFundingTime?: number;
}

/**
 * Fee calculator interface
 */
export interface FeeCalculator {
  /**
   * Get total fee percentage for a round-trip trade (buy + sell)
   * @param currency - Quote currency (e.g., "USDT")
   * @param orderType - "taker" or "maker"
   * @returns Total fee percentage (e.g., 0.4 for 0.4%)
   */
  getBothSideFeePercent(params: {
    currency?: string;
    type: "taker" | "maker";
  }): number;

  /**
   * Get fee percentage for a single side (buy or sell)
   * @param side - "buy" or "sell"
   * @param currency - Quote currency
   * @param orderType - "taker" or "maker"
   * @returns Fee percentage
   */
  getTotalFeePercent(params: {
    side: "buy" | "sell";
    currency?: string;
    type: "taker" | "maker";
  }): number;
}

/**
 * Exchange adapter configuration
 */
export interface ExchangeConfig {
  /** Default trading mode for this exchange instance */
  defaultTradingMode?: TradingMode;
}

/** Parameters for confirming that an exchange position has fully closed. */
export interface ExchangeEnsureClosedParams {
  symbol: string;
  direction: "LONG" | "SHORT";
}

/** Result of exchange position-close confirmation and residual retries. */
export interface ExchangeEnsureClosedResult {
  closed: boolean;
  remainingAmount: number;
  retryOrders: number;
}

/**
 * Exchange interface
 * All exchange adapters must implement this interface
 */
export interface IExchange {
  /**
   * Get the exchange type
   */
  readonly exchangeType: ExchangeType;

  /**
   * Get the default trading mode
   */
  readonly defaultTradingMode?: TradingMode;

  /**
   * Get account balance for a trading pair
   * @param symbol - Trading pair in normalized format (e.g., "BTC_USDT")
   * @returns Balance or null if not found
   */
  getBalance(symbol: string): Promise<UnifiedBalance | null>;

  /**
   * Create a new order
   * @param params - Unified order parameters
   * @returns Order response
   */
  createOrder(params: UnifiedOrderParams): Promise<UnifiedOrderResponse>;

  /** Confirm an exit and close any residual exchange position. */
  ensureClosed(
    params: ExchangeEnsureClosedParams,
  ): Promise<ExchangeEnsureClosedResult>;

  /**
   * Withdraw an asset to an external wallet.
   *
   * Adapters should throw when the exchange or asset is unsupported.
   */
  withdrawAsset(
    params: UnifiedWithdrawAssetParams,
  ): Promise<UnifiedWithdrawAssetResponse>;

  /**
   * Get kline/candlestick data.
   *
   * Returned klines are expected to stay in chronological order:
   * oldest candle first, latest candle last.
   * That means:
   * - `klines[0]` is the earliest candle in the returned window
   * - `klines.at(-1)` is the latest returned candle
   *
   * Each `Kline` item follows this tuple shape:
   * `[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignoreA, ignoreB]`
   *
   * Example request:
   * ```ts
   * const klines = await exchange.getKlines({
   *   symbol: "BTC_USDT",
   *   interval: "5m",
   *   limit: 3,
   *   marketType: "FUTURES",
   * });
   * ```
   *
   * Example returned data:
   * ```ts
   * [
   *   [
   *     1713686400000,
   *     "65000.10",
   *     "65120.00",
   *     "64980.50",
   *     "65090.30",
   *     "125.42",
   *     1713686699999,
   *     "8154321.55",
   *     1820,
   *     "61.20",
   *     "3987654.12",
   *     "0",
   *     "0",
   *   ],
   * ]
   * ```
   *
   * @param params - Kline parameters such as symbol, interval, time range, limit, and optional market type.
   * @returns Array of klines sorted from oldest to newest.
   */
  getKlines(params: UnifiedGetKlinesParams): Promise<Kline[]>;

  /**
   * Get open orders
   * @param symbol - Trading pair symbol
   * @returns Array of open orders
   */
  getOpenOrders(
    symbol?: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<UnifiedOrderResponse[]>;

  /**
   * Get the last order (filled or otherwise) for a symbol
   * @param symbol - Trading pair symbol
   * @returns The last order or null if none found
   */
  getLastOrder(symbol: string): Promise<UnifiedOrderResponse | null>;

  /**
   * Get specific order details
   * @param symbol - Trading pair symbol
   * @param orderId - Order ID
   * @returns Order details
   */
  getOrder?(symbol: string, orderId: string): Promise<UnifiedOrderResponse>;

  /**
   * Cancel an order
   * @param orderId - Order ID to cancel
   * @param symbol - Trading pair symbol (optional, some exchanges require it)
   * @returns Success status
   */
  cancelOrder(orderId: string, symbol?: string): Promise<boolean>;

  /**
   * Get fee calculator for this exchange
   * @returns Fee calculator instance
   */
  getFees(): FeeCalculator;

  /**
   * Get minimum quantity and step size for a symbol
   * @param symbol - Trading pair in normalized format
   * @returns Min quantity and step size
   */
  getMinQtyAndStepSize(
    symbol: string,
  ): Promise<{ minQty: number; stepSize: number }>;

  /**
   * Get price tick size for a symbol
   * @param symbol - Trading pair in normalized format
   * @returns Tick size
   */
  getTickSize(symbol: string): Promise<number>;

  /**
   * Round price to tick size
   * @param symbol - Trading pair in normalized format
   * @param price - Price to round
   * @returns Rounded price
   */
  roundToTick(symbol: string, price: number): Promise<number>;

  /**
   * Normalize symbol from exchange format to internal format
   * @param symbol - Symbol in exchange format
   * @returns Symbol in normalized format (BTC_USDT)
   */
  normalizeSymbol(symbol: string): string;

  /**
   * Denormalize symbol from internal format to exchange format
   * @param symbol - Symbol in normalized format (BTC_USDT)
   * @returns Symbol in exchange format
   */
  denormalizeSymbol(symbol: string): string;

  /**
   * Set Leverage for a symbol
   * @param symbol - Symbol in normalized format
   * @param leverage - Leverage value (e.g. 10)
   * @returns boolean success
   */
  setLeverage(symbol: string, leverage: number): Promise<boolean>;

  /**
   * Adjust quantity to be valid for the exchange
   * @param quantity - Raw quantity
   * @param symbol - Trading pair
   * @returns Adjusted quantity
   */
  adjustQuantity(quantity: number, symbol: string): Promise<number>;
  /**
   * Repay margin loan
   * @param symbol - Trading pair
   * @param amount - Amount to repay
   * @param currency - Currency to repay (e.g. "SUI")
   * @param options - Additional options (tradingMode, etc)
   */
  repay(
    symbol: string,
    amount: number,
    currency: string,
    options?: { tradingMode?: TradingMode; repayCurrency?: string },
  ): Promise<boolean>;

  /**
   * Close entire position (Futures/Margin)
   */
  closePosition(
    symbol: string,
    options?: { tradingMode?: TradingMode },
  ): Promise<boolean>;

  /**
   * Get open positions
   */
  getPositions(symbol?: string): Promise<UnifiedPosition[]>;

  /**
   * Get tickers for all symbols or specific symbol
   */
  getTickers(params?: {
    containSymbol?: string;
    marketType?: "SPOT" | "FUTURES";
  }): Promise<UnifiedTicker[]>;

  /** Get latest perpetual-futures funding rates when supported. */
  getFundingRates?(symbols?: string[]): Promise<UnifiedFundingRate[]>;

  /**
   * Get top gainers with verified volume
   * @param params.marketType - Market type: SPOT or FUTURES
   * @param params.need - Number of gainers to return (default: 10)
   * @returns Array of verified gainers sorted by change percent
   */
  getGainers(params?: {
    marketType?: "SPOT" | "FUTURES";
    need?: number;
  }): Promise<UnifiedTicker[]>;

  /**
   * Get market cap in USD for a coin symbol/pair.
   * This is backed by an external provider (e.g. CoinGecko) and may be cached.
   */
  getMarketCap(symbol: string): Promise<number | null>;
}

/**
 * Represents an open trading position on an exchange.
 */
// export interface Position {
export interface UnifiedPosition {
  /**
   * Unified symbol BTC_USDT
   */
  symbol: string;

  /**
   * Original symbol from exchange.
   * eg: BTCUSDT, BTC-USDT-SWAP
   */
  originalSymbol: string;

  /**
   * Position direction.
   * - `LONG`: Buying with expectation of price increase.
   * - `SHORT`: Selling with expectation of price decrease.
   * - `NET`: Used in One-Way Mode where only a single net position exists per symbol.
   */
  side: "LONG" | "SHORT" | "NET";

  /**
   * Position size.
   * Usually in Base Asset units (e.g. 0.5 BTC) or Contracts.
   */
  amount: number;

  /**
   * Average entry price of the position.
   */
  entryPrice: number;

  /**
   * Current mark price (or best available current price) for the position.
   */
  markPrice?: number;

  /**
   * Unrealized Profit or Loss in Quote Asset (usually USDT).
   */
  unrealizedPnL?: number;

  /**
   * Leverage multiplier used (e.g. 10 for 10x).
   */
  leverage?: number;

  /**
   * Margin mode: 'isolated' or 'cross'.
   */
  marginMode?: string;

  /**
   * Total notional value of the position in USDT.
   * Calculated as: `Quantity * Price`.
   *
   * @example
   * If you open a position with 100 USDT value (notional) at 3x leverage:
   * this will be 100 USDT.
   */
  sizeUSDT: number;

  /**
   * Actual margin (collateral) assigned to this position in USDT.
   * Calculated as: `sizeUSDT / leverage`.
   *
   * @example
   * If you open a position with 100 USDT value (notional) at 3x leverage:
   * this will be ~33.33 USDT.
   */
  marginUSDT: number;

  /**
   * Estimated price at which the position will be liquidated.
   */
  liquidationPrice: number;
}

export type UnifiedKline = Kline;
