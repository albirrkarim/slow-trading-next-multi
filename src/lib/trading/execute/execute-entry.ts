import type { ExchangeType, UnifiedOrderParams } from "@/lib/exchange";
import { getCurrentExchangeAccountSlug } from "@/lib/exchange/account-context";
import {
  getExchange,
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
} from "@/lib/exchange";
import type {
  TradeDecision,
  TradingModelConfig,
  TradingModelMemory,
  Position,
  PositionAveragingState,
  PositionEntrySourceOverride,
} from "@/lib/trading/models";
import moment from "moment-timezone";
import type { EntryRecommendation } from "../../brain/algorithms/type-execute";
import { decisionEngineLevelConfig } from "../../brain/algorithms/v4/decisions/v19/constants";
import type { Kline } from "../../exchange/platform/tokocrypto";
import { tradeLog } from "../helper/log";
import { notif } from "../helper/notification"; // Email/notification system
import type { NotificationDashboard } from "@/lib/notification/config";
import { TRADE_MESSAGE } from "../message";
import type { InitialBalance, TradingDetail, TradingReturn } from "../type"; // Config & return types
import { dynamicEntry } from "./models/entry";
import type { DynamicTradeConfig } from "@/lib/dynamic";
import { resolveEntryLeverage } from "./entry-leverage";
import entryFunding from "./entry-funding";
import entryOpenPositionGuard from "./entry-open-position-guard";
import lateEntryVPointDrift from "./late-entry-vpoint-drift";
import entryMarket from "./entry-market";
import { buildSlowWatchReserveState } from "../../slowTrading/watch-reserve";
import tradingPosition from "../position";

interface ExecuteEntryProps {
  investAmount: number;
  entrySignal: EntryRecommendation;
  current?: Kline;
  modelConfig: TradingModelConfig;
  modelMemory: TradingModelMemory;
  exchangeType: ExchangeType;
  tradingMode: TradingMode;
  bypass?: boolean;
  simulate?: boolean;
  balanceOverride?: InitialBalance;
  executionMode?: "live" | "sandbox";
  notificationTarget?: {
    dashboard: NotificationDashboard;
    successKey: string;
    failureKey: string;
  };
  reservedQuoteAsset?: number;
  dynamicTradeConfig: DynamicTradeConfig;
  allModelMemories?: TradingModelMemory[];
  volume24h?: number;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildPersistedEntryFeature(entrySignal: EntryRecommendation) {
  const feature =
    entrySignal.feature && typeof entrySignal.feature === "object"
      ? cloneJson(entrySignal.feature)
      : {};

  return Object.keys(feature).length > 0 ? feature : undefined;
}

function buildEmptyAveragingState(
  entryLevel: number,
  baseMarginUsdt: number,
): PositionAveragingState {
  return {
    entryLevel,
    lastHandledLevel: entryLevel,
    reserveBaseMarginUsdt: baseMarginUsdt,
    reservedRemainingMarginUsdt: 0,
    steps: [],
  };
}

function resolveEntrySource(
  bypass: boolean,
  category?: string,
): PositionEntrySourceOverride | undefined {
  if (bypass) return "BYPASS";
  return category?.includes("MANUAL") ? "MANUAL" : undefined;
}

export function calculateExecutedEntryAccounting(params: {
  feeRate: number;
  leverage: number;
  price: number;
  quantity: number;
  tradingMode: TradingMode;
}) {
  const price = Number.isFinite(params.price) ? params.price : 0;
  const quantity = Number.isFinite(params.quantity) ? params.quantity : 0;
  const leverage = Math.max(
    1,
    Number.isFinite(params.leverage) ? params.leverage : 1,
  );
  const feeRate = Number.isFinite(params.feeRate)
    ? Math.max(0, params.feeRate)
    : 0;
  const notionalUSDT = quantity * price;
  const feeUSDT = notionalUSDT * feeRate;
  const marginUSDT =
    params.tradingMode === TradingMode.SPOT
      ? notionalUSDT
      : notionalUSDT / leverage;

  return {
    feeUSDT,
    marginUSDT,
    notionalUSDT,
    quoteSpentUSDT: marginUSDT + feeUSDT,
  };
}

export async function executeEntry({
  investAmount,
  current, // Current candle (last minute)
  entrySignal,
  modelConfig, // Strategy configuration,
  modelMemory,
  exchangeType = "tokocrypto",
  tradingMode = TradingMode.SPOT,
  bypass = false,
  simulate = false,
  balanceOverride,
  executionMode = "live",
  notificationTarget,
  reservedQuoteAsset = 0,
  dynamicTradeConfig,
  allModelMemories,
  volume24h,
}: ExecuteEntryProps): Promise<TradingReturn> {
  const { orderType = "taker", onlyTPFromDate } = modelConfig; // Default to taker orders (market)

  if (!modelMemory.positions) {
    // Save buy record, to track the price
    modelMemory.positions = [] as Position[];
  }

  const isTest = simulate;
  const symbol = entrySignal.symbol ?? "";
  const activePositions =
    allModelMemories?.flatMap((memory) => memory.positions ?? []) ??
    modelMemory.positions;
  const openPositionGuard = entryOpenPositionGuard.evaluate({
    maxOpenPositions: dynamicTradeConfig.maxOpenPositions,
    positions: activePositions,
  });

  // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
  if (openPositionGuard.blocked) {
    return {
      symbol: entrySignal.symbol,
      message: openPositionGuard.reason!,
    };
  }

  if (
    !decisionEngineLevelConfig.isActionableLevel(
      entrySignal,
      dynamicTradeConfig.minActionableAbsoluteLevel,
    )
  ) {
    const minActionableAbsoluteLevel =
      decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
        dynamicTradeConfig.minActionableAbsoluteLevel,
      );
    return {
      symbol: entrySignal.symbol,
      message:
        `[ENTRY_BELOW_MIN_ACTIONABLE_LEVEL] Entry skipped because ${symbol || "unknown"} ` +
        `level ${entrySignal.lvl ?? "unknown"} is below configured absolute level ` +
        `${minActionableAbsoluteLevel}`,
    };
  }

  const tradingSymbol = symbol.includes("_") ? symbol : symbol + "_USDT";

  const exchange = getExchange(exchangeType, {
    defaultTradingMode: tradingMode,
  });

  const baseAssetSymbol = symbol;
  const quoteAssetSymbol = "USDT";

  let currentBalance = undefined;

  // A.0 Get real quote and base
  const realBalance =
    balanceOverride ?? (await exchange.getBalance(tradingSymbol));
  if (realBalance == null) {
    return {
      symbol: entrySignal.symbol,
      message: `Can't fetch real balance! ${tradingSymbol}`,
    };
  }

  // A.1 Quote Asset To Trade
  if (modelMemory.quoteAssetToTrade !== undefined) {
    currentBalance = {
      ...realBalance,
      quoteAsset: modelMemory.quoteAssetToTrade,
    };
  } else {
    // A.2 model passive and older
    currentBalance = realBalance;
  }

  tradeLog.debug("Real Balance ", currentBalance);

  if (!currentBalance) {
    tradeLog.error("Balance not defined");
    return {
      symbol: entrySignal.symbol,
      message: "Balance not defined",
    };
  }

  /**
   * C. Fetch fresh candles whenever the caller did not provide one.
   *    Sandbox mode still needs a live market price even though execution is simulated.
   */
  if (!current) {
    current = await entryMarket.currentKline.getLatest({
      exchange,
      symbol,
      tradingMode,
    });
  }

  if (!current) {
    tradeLog.error("current undefined, Empty kline data");
    return {
      symbol: entrySignal.symbol,
      message: "Current kline undefined",
    };
  }

  /**
   * in USDT
   */
  let totalFee = 0;
  let totalTax = 0;
  const totalProfit = 0;

  /**
   * In Percentage
   */
  const totalProfitPercent = 0;

  // Determine order type: taker = MARKET, maker = LIMIT
  const orderTypeCode =
    orderType === "taker" ? UnifiedOrderType.MARKET : UnifiedOrderType.LIMIT;

  // Current price from OHLCV (close price)
  const price = parseFloat(current[4]);

  const lastVolatility = modelMemory.volatility?.lastVolatility.at(-1);
  const direction =
    tradingMode == TradingMode.SPOT
      ? "LONG"
      : lastVolatility?.l === "T"
        ? "SHORT"
        : "LONG";

  const lateEntryGuard = lateEntryVPointDrift.evaluate({
    currentPrice: price,
    direction,
    vPointPrice: entrySignal.p,
  });

  // PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT
  if (lateEntryGuard.blocked) {
    return {
      symbol: entrySignal.symbol,
      message: lateEntryGuard.reason!,
    };
  }

  // Real success order or not,
  let success = false;
  let tradingResult = undefined;
  let usdtSpent = 0;

  const requestedMarginUsdt = entryFunding.requestedMargin.resolve({
    bypass,
    exchangeType,
    investAmount,
    maxUsdtEntry: entrySignal.maxUsdtEntry,
    probability: entrySignal.amountProbab,
  });

  let leverage = 1;

  if (tradingMode === TradingMode.FUTURES) {
    leverage = resolveEntryLeverage({
      entrySignal,
      tradingMode,
      config: dynamicTradeConfig,
    });

    // PROD:FUTURES_ENTRY_ACCOUNT_SETUP
    // Sandbox shares leverage math with live trading but must not mutate the exchange account.
    if (!isTest) {
      const leverageSet = await exchange.setLeverage(tradingSymbol, leverage);

      if (!leverageSet) {
        throw new Error(
          `Failed to configure futures leverage and isolated margin for ${tradingSymbol} at ${leverage}x`,
        );
      }

      tradeLog.log(
        `[ExecuteEntry] Leverage set to ${leverage}x for ${tradingSymbol} amountProbab: ${entrySignal.amountProbab}`,
      );
    }
  }

  modelConfig.balanceUSDT = requestedMarginUsdt;

  const decision: TradeDecision = await dynamicEntry({
    symbol,
    current,
    config: modelConfig,
    memory: modelMemory,
    bypass,
    minActionableAbsoluteLevel:
      dynamicTradeConfig.minActionableAbsoluteLevel,
  });

  const entryVPoint = decision.entryVPoint ?? {
    id: entrySignal.id,
    lvl: entrySignal.lvl ?? 0,
  };

  tradeLog.log("\n\n Decision ", decision);

  let message = decision.log ?? decision.reason ?? "-";

  /**
   * F. Execute BUY logic (new entry only — no averaging)
   */
  if (decision.action === "BUY" && !modelMemory.forceSell) {
    const quoteAssetBefore = currentBalance.quoteAsset;

    /**
     * Get the amount of USDT from model suggestion or the all in with all USDT asset in balance
     */
    const requestedDecisionMarginUsdt =
      decision.amount ?? quoteAssetBefore;

    // Calculate total buy fee early because futures reserve fitting is based on margin.
    const totalFeePercent = exchange.getFees().getTotalFeePercent({
      side: "buy",
      currency: quoteAssetSymbol,
      type: orderType as "maker" | "taker",
    });

    const totalFeeRate = totalFeePercent / 100;
    const fundingPlan = entryFunding.plan.calculate({
      activePositions,
      config: dynamicTradeConfig,
      direction,
      entryLevel: entryVPoint.lvl,
      feeRate: totalFeeRate,
      leverage,
      requestedMarginUsdt: requestedDecisionMarginUsdt,
      reservedQuoteAsset,
      spendableQuoteAsset: quoteAssetBefore,
      tradingMode,
      volume24h,
    });
    const amountToBuy = fundingPlan.adjustedNotionalUsdt;

    if (fundingPlan.blockReason) {
      return {
        symbol: entrySignal.symbol,
        message: fundingPlan.blockReason,
      };
    }

    // We will calculate usdtSpent and quoteStill after calculating fees

    // F.1 Only TP from defined date
    if (onlyTPFromDate) {
      const targetMoment = moment(onlyTPFromDate, "M/D/YYYY");
      const now = moment(current[0]);
      if (now.isAfter(targetMoment)) {
        return {
          symbol: entrySignal.symbol,
          message: `${TRADE_MESSAGE.buy.NO_MORE_AFTER_DATE} We can only sell to TP from ${onlyTPFromDate} no more buy!`,
        };
      }
    }

    // F.2 Start to buy

    const estimatedFeeAmount = fundingPlan.estimatedFeeUsdt;
    const availableSaldo = fundingPlan.availableNotionalUsdt;
    const enableWatchLogic = dynamicTradeConfig.enableWatchLogic !== false;
    const watchReserveLevels = dynamicTradeConfig.watchReserveLevels ?? 2;
    const watchReservePctAlloc =
      dynamicTradeConfig.watchReservePctAlloc ?? 2;

    const preferredQuantity = availableSaldo / price;

    // Quantity of base asset (BTC) to buy
    const quantity = await exchange.adjustQuantity(
      preferredQuantity,
      tradingSymbol,
    );

    if (quantity == 0) {
      return {
        symbol: entrySignal.symbol,
        message: `${TRADE_MESSAGE.cancel.amount.NO_ENOUGH} No enough balance to buy! preferredQuantity:${preferredQuantity} amountToBuy:${amountToBuy} fee:${estimatedFeeAmount} tax:0 availableSaldo:${availableSaldo}`,
      };
    }

    const executedAccounting = calculateExecutedEntryAccounting({
      feeRate: totalFeeRate,
      leverage,
      price,
      quantity,
      tradingMode,
    });
    usdtSpent = -executedAccounting.quoteSpentUSDT;
    const quoteStill = quoteAssetBefore - executedAccounting.quoteSpentUSDT;
    const actualWatchState = enableWatchLogic
      ? buildSlowWatchReserveState({
          direction,
          baseMarginUsdt: executedAccounting.marginUSDT,
          entryLevel: entryVPoint.lvl,
          reserveLevels: watchReserveLevels,
          maxNextLevels:
            dynamicTradeConfig.watchMaxNextAveragingLevels ??
            watchReserveLevels,
          pctAlloc: watchReservePctAlloc,
        })
      : undefined;

    // Update position (sandbox simulation)
    if (isTest) {
      modelMemory.positions.push({
        // BOTH:MULTI_ACCOUNT_POSITION_OWNER
        account: getCurrentExchangeAccountSlug(),
        symbol,
        executionMode,
        tradingMode,
        direction,
        opened: {
          t: current[0],
          vPoint: entryVPoint,
          source: resolveEntrySource(bypass, decision.category),
          reason: tradingPosition.entry.reason.resolve(decision.category),
          message,
          price,
        },
        exposure: {
          quantity,
          averageEntryPrice: price,
          notionalUsdt: executedAccounting.notionalUSDT,
          marginUsdt: executedAccounting.marginUSDT,
          leverage,
        },
        fees: {
          entryUsdt: executedAccounting.feeUSDT,
          estimatedExitUsdt: executedAccounting.feeUSDT,
        },
        strategy: {
          entry: {
            engine: dynamicTradeConfig.decisionEngineVersion as
              | Position["strategy"]["entry"]["engine"]
              | undefined,
            feature: buildPersistedEntryFeature(entrySignal),
            label: decision.category?.replaceAll("[", "").replaceAll("]", ""),
          },
          averaging:
            actualWatchState ??
            buildEmptyAveragingState(
              entryVPoint.lvl,
              executedAccounting.marginUSDT,
            ),
        },
        pnl: {},
      });

      const sandboxMessage = `[SANDBOX] ${TRADE_MESSAGE.buy.ENTRY} | ${symbol} ${direction}
        | USDT: $${executedAccounting.notionalUSDT.toFixed(2)} @ Price: $${price.toFixed(5)}
        | Quantity: ${quantity}
        | ${tradingMode == TradingMode.FUTURES ? `Leverage: ${leverage}x` : ""}
        | ${exchangeType}:${tradingMode}
        `;
      const body = JSON.stringify(
        {
          modelDecision: {
            decision,
            requestedDecisionMarginUsdt,
            amountToBuy,
            quoteAssetBefore,
            availableSaldo,
            price,
            preferredQuantity,
            quantity,
          },
          sandbox: true,
        },
        null,
        2,
      );

      if (notificationTarget) {
        void notif.central({
          dashboard: notificationTarget.dashboard,
          // PROD:NOTIF_ENTRY
          key: notificationTarget.successKey,
          title: sandboxMessage,
          message: body,
        });
      } else {
        void notif.central({
          subject: sandboxMessage,
          body,
        });
      }
    }

    // Update balances
    totalFee = executedAccounting.feeUSDT;
    totalTax = 0; // Unified interface aggregates tax into fee, or assumes 0 if not exposed

    currentBalance.baseAsset = quantity;
    currentBalance.quoteAsset = quoteStill;

    // Place order on live exchange
    if (!isTest) {
      const buyParam: UnifiedOrderParams = {
        tradeType: "ENTRY",
        symbol: tradingSymbol,
        side:
          direction === "LONG" ? UnifiedOrderSide.BUY : UnifiedOrderSide.SELL,
        type: orderTypeCode,
        quantity,
        price,
        tradingMode,
        // timeInForce handled in adapter for LIMIT orders
      };

      try {
        tradeLog.log("BUY Params:", buyParam);

        const buyResult = await exchange.createOrder(buyParam);

        tradeLog.log("BUY Result:", JSON.stringify(buyResult, null, 2));

        // If we reach here, it's successful (adapter throws on error)
        success = true;

        // Real data from exchange
        const executedPrice = buyResult.executedPrice || price;
        let executedQty = buyResult.executedQty || 0;

        // If adapter didn't return executedQty (e.g. OKX Market Buy), try to fetch it
        if (!executedQty || executedQty === 0) {
          try {
            // Wait a moment for order to process/fill
            await new Promise((r) => setTimeout(r, 2000));
            const lastOrder = await exchange.getLastOrder(tradingSymbol);
            if (lastOrder && lastOrder.orderId === buyResult.orderId) {
              executedQty = lastOrder.executedQty || 0;
              tradeLog.log(
                `[ExecuteEntry] Fetched updated executedQty: ${executedQty}`,
              );
            }
          } catch (e) {
            tradeLog.warn("Failed to fetch executedQty update", e);
          }
        }

        // Fallback to calculated quantity if still 0
        if (executedQty === 0) {
          executedQty = quantity;
        }

        const executedQuoteQty = executedPrice * executedQty;
        const liveMarginUSDT =
          tradingMode === TradingMode.SPOT
            ? executedQuoteQty
            : executedQuoteQty / leverage;

        const liveWatchState = enableWatchLogic
          ? buildSlowWatchReserveState({
              direction,
              baseMarginUsdt: liveMarginUSDT,
              entryLevel: entryVPoint.lvl,
              reserveLevels: watchReserveLevels,
              maxNextLevels:
                dynamicTradeConfig.watchMaxNextAveragingLevels ??
                watchReserveLevels,
              pctAlloc: watchReservePctAlloc,
            })
          : undefined;
        const entryMessage = `${TRADE_MESSAGE.buy.ENTRY} | ${symbol} ${direction}
        | USDT: $${executedQuoteQty.toFixed(
          2,
        )} @ Price: $${executedPrice.toFixed(5)}
        | Quantity: ${executedQty}
        | ${tradingMode == TradingMode.FUTURES ? `Leverage: ${leverage}x` : ""}
        | ${exchangeType}:${tradingMode}
        `;

        modelMemory.positions.push({
          // BOTH:MULTI_ACCOUNT_POSITION_OWNER
          account: getCurrentExchangeAccountSlug(),
          symbol,
          executionMode,
          tradingMode,
          direction,
          opened: {
            t: current[0],
            vPoint: entryVPoint,
            source: resolveEntrySource(bypass, decision.category),
            reason: tradingPosition.entry.reason.resolve(decision.category),
            message: entryMessage,
            price: executedPrice,
          },
          exposure: {
            quantity: executedQty,
            averageEntryPrice: executedPrice,
            notionalUsdt: executedQuoteQty,
            marginUsdt: liveMarginUSDT,
            leverage,
          },
          fees: {
            entryUsdt: executedQuoteQty * totalFeeRate,
            estimatedExitUsdt: executedQuoteQty * totalFeeRate,
          },
          strategy: {
            entry: {
              engine: dynamicTradeConfig.decisionEngineVersion as
                | Position["strategy"]["entry"]["engine"]
                | undefined,
              feature: buildPersistedEntryFeature(entrySignal),
              label: decision.category
                ?.replaceAll("[", "")
                .replaceAll("]", ""),
            },
            averaging:
              liveWatchState ??
              buildEmptyAveragingState(entryVPoint.lvl, liveMarginUSDT),
          },
          pnl: {},
        });

        tradingResult = buyResult;

        message = entryMessage;

        // Send notification email
        const body = JSON.stringify(
          {
            modelDecision: {
              decision,
              requestedDecisionMarginUsdt,
              amountToBuy,
              quoteAssetBefore,
              availableSaldo,
              price,
              preferredQuantity,
              quantity,
            },
            buyParam,
            buyResult,
          },
          null,
          2,
        );

        if (notificationTarget) {
          void notif.central({
            dashboard: notificationTarget.dashboard,
            // PROD:NOTIF_ENTRY
            key: notificationTarget.successKey,
            title: message,
            message: body,
          });
        } else {
          void notif.central({
            subject: message,
            body,
          });
        }
      } catch (error: any) {
        tradeLog.error("BUY Failed:", error);

        // Send notification email for failure
        const body = JSON.stringify({
          modelDecision: {
            decision,
            amountToBuy,
          },
          buyParam,
          error: error.message || error,
        });

        if (notificationTarget) {
          void notif.central({
            dashboard: notificationTarget.dashboard,
            // PROD:NOTIF_ENTRY_FAILED
            key: notificationTarget.failureKey,
            title: "BUY ORDER FAILED",
            message: body,
          });
        } else {
          void notif.central({
            subject: "BUY ORDER FAILED",
            body,
          });
        }

        message = error.message;

        tradingResult = { error: error.message };
      }
    }
  }

  let tradingDetail: TradingDetail | undefined = undefined;

  if (decision.action !== "HOLD") {
    tradingDetail = {
      baseAssetSymbol,
      action: decision.action,
      finalBalance: currentBalance.quoteAsset,
      usdtSpent,
      totalFee,
      totalTax,
      totalProfit,
      totalProfitPercent,
    };
  }

  /**
   * H. Return trade result summary
   */
  return {
    symbol: entrySignal.symbol,
    message,
    tradingDetail: isTest ? tradingDetail : success ? tradingDetail : undefined,
    tradingResult,
  };
}
