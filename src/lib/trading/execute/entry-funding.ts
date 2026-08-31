import { TradingMode, type ExchangeType } from "@/lib/exchange";
import slowTradingWatchReserve, {
  type WatchReserveState,
} from "@/lib/slowTrading/watch-reserve";
import type { Position } from "@/lib/trading/models";
import {
  MINIMAL_USDT_TO_TRADE,
  MINIMAL_USDT_TO_TRADE_BYPASS,
} from "../constants";
import { TRADE_MESSAGE } from "../message";

interface EntryFundingConfig {
  enableWatchLogic?: boolean;
  maxEntryBased24HourVolPct?: number;
  maxEntryMargin?: number;
  maxEntryMarginPct?: number;
  watchMaxNextAveragingLevels?: number;
  watchReserveLevels?: number;
  watchReservePctAlloc?: number;
}

interface EntryFundingPlanParams {
  activePositions: Array<Pick<Position, "strategy">>;
  config: EntryFundingConfig;
  direction: "LONG" | "SHORT";
  entryLevel: number;
  feeRate: number;
  leverage: number;
  requestedMarginUsdt: number;
  reservedQuoteAsset: number;
  spendableQuoteAsset: number;
  tradingMode: TradingMode;
  volume24h?: number;
}

export interface EntryFundingPlan {
  adjustedNotionalUsdt: number;
  availableNotionalUsdt: number;
  bailoutBufferUsdt: number;
  blockCode?: string;
  blockReason?: string;
  estimatedFeeUsdt: number;
  estimatedMarginUsdt: number;
  marginRate: number;
  projectedWatchState?: WatchReserveState;
  reserveBudgetUsdt: number;
  spendableAfterEntryUsdt: number;
  spendableUsdt: number;
  totalRequiredUsdt: number;
}

/** Resolves the probability-sized margin requested for an entry. */
function resolveRequestedMarginUsdt(params: {
  bypass: boolean;
  exchangeType: ExchangeType;
  investAmount: number;
  maxUsdtEntry?: number;
  probability: number;
}): number {
  let requestedMarginUsdt = Math.floor(
    params.investAmount * params.probability,
  );

  if (params.maxUsdtEntry) {
    requestedMarginUsdt = Math.min(
      requestedMarginUsdt,
      params.maxUsdtEntry,
    );
  }

  if (params.bypass) {
    requestedMarginUsdt = Math.max(
      requestedMarginUsdt,
      MINIMAL_USDT_TO_TRADE_BYPASS[params.exchangeType],
    );
  }

  return requestedMarginUsdt;
}

/**
 * Calculates the production entry funding plan without mutating balances.
 */
function calculateEntryFundingPlan(
  params: EntryFundingPlanParams,
): EntryFundingPlan {
  const feeRate = Number.isFinite(params.feeRate)
    ? Math.max(0, params.feeRate)
    : 0;
  const leverage = Math.max(
    1,
    Number.isFinite(params.leverage) ? params.leverage : 1,
  );
  const spendableUsdt = Math.max(
    0,
    params.spendableQuoteAsset - params.reservedQuoteAsset,
  );
  const watchEnabled = params.config.enableWatchLogic !== false;
  const reserveLevels = params.config.watchReserveLevels ?? 2;
  const pctAlloc = params.config.watchReservePctAlloc ?? 2;
  const marginRate =
    params.tradingMode === TradingMode.SPOT
      ? 1
      : (1 - feeRate) / leverage + feeRate;
  // BOTH:ADJUST_ENTRY_AMOUNT
  const adjustedMarginBudget =
    marginRate > 0
      ? slowTradingWatchReserve.entry.adjustMarginForConfig({
          desiredMarginUsdt: params.requestedMarginUsdt,
          spendableUsdt,
          enableWatchLogic: watchEnabled,
          reserveLevels,
          pctAlloc,
          maxEntryBased24HourVolPct:
            params.config.maxEntryBased24HourVolPct ?? 0.2,
          volume24h: params.volume24h,
          maxEntryMarginPct: params.config.maxEntryMarginPct ?? 0,
          maxEntryMargin: params.config.maxEntryMargin ?? 0,
        })
      : 0;
  const adjustedNotionalUsdt =
    marginRate > 0 ? adjustedMarginBudget / marginRate : 0;
  const estimatedFeeUsdt = adjustedNotionalUsdt * feeRate;
  const availableNotionalUsdt =
    adjustedNotionalUsdt - estimatedFeeUsdt;
  const estimatedMarginUsdt =
    params.tradingMode === TradingMode.SPOT
      ? adjustedNotionalUsdt
      : availableNotionalUsdt / leverage + estimatedFeeUsdt;
  const projectedWatchState = watchEnabled
    ? slowTradingWatchReserve.reserve.buildState({
        direction: params.direction,
        baseMarginUsdt: estimatedMarginUsdt,
        entryLevel: params.entryLevel,
        reserveLevels,
        maxNextLevels:
          params.config.watchMaxNextAveragingLevels ?? reserveLevels,
        pctAlloc,
      })
    : undefined;
  const reserveBudgetUsdt =
    slowTradingWatchReserve.reserve.getReservedRemainingUsdt(
      projectedWatchState,
    );
  const totalRequiredUsdt = estimatedMarginUsdt + reserveBudgetUsdt;
  const bailoutGate =
    slowTradingWatchReserve.balance.canKeepSpendableForLargestUnreservedBailout(
      {
        activePositions: params.activePositions,
        entryMarginUsdt: estimatedMarginUsdt,
        projectedWatchState,
        reserveBudgetUsdt,
        spendableUsdt,
      },
    );

  let blockCode: string | undefined;
  let blockReason: string | undefined;
  if (adjustedMarginBudget < MINIMAL_USDT_TO_TRADE) {
    blockCode = "ENTRY_AMOUNT_TOO_SMALL";
    blockReason =
      `${TRADE_MESSAGE.cancel.amount.TOO_SMALL} Entry margin to ` +
      `${TRADE_MESSAGE.buy.LONG} too small ${adjustedMarginBudget.toFixed(2)} ` +
      `minimal ${MINIMAL_USDT_TO_TRADE.toFixed(2)}`;
  } else if (spendableUsdt < totalRequiredUsdt) {
    // BOTH:HAVE_ENOUGH_TO_RESERVED
    blockCode = "INSUFFICIENT_ENTRY_RESERVE";
    blockReason =
      `${TRADE_MESSAGE.cancel.amount.NO_ENOUGH} Not enough spendable balance to buy with reserve. ` +
      `spendableUSDT:${spendableUsdt.toFixed(2)} ` +
      `entryMarginUSDT:${estimatedMarginUsdt.toFixed(2)} ` +
      `reserveBudgetUSDT:${reserveBudgetUsdt.toFixed(2)} ` +
      `totalRequiredUSDT:${totalRequiredUsdt.toFixed(2)} ` +
      `reservedUSDT:${params.reservedQuoteAsset.toFixed(2)}`;
  } else if (!bailoutGate.canEnter) {
    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    blockCode = "INSUFFICIENT_BAILOUT_BUFFER";
    blockReason =
      `${TRADE_MESSAGE.cancel.amount.NO_ENOUGH} Not enough spendable balance to keep bailout buffer. ` +
      `spendableUSDT:${spendableUsdt.toFixed(2)} ` +
      `entryMarginUSDT:${estimatedMarginUsdt.toFixed(2)} ` +
      `reserveBudgetUSDT:${reserveBudgetUsdt.toFixed(2)} ` +
      `spendableAfterEntryUSDT:${bailoutGate.spendableAfterEntryUsdt.toFixed(2)} ` +
      `largestUnreservedBailoutUSDT:${bailoutGate.largestUnreservedBailoutUsdt.toFixed(2)} ` +
      `reservedUSDT:${params.reservedQuoteAsset.toFixed(2)}`;
  }

  return {
    adjustedNotionalUsdt,
    availableNotionalUsdt,
    bailoutBufferUsdt: bailoutGate.largestUnreservedBailoutUsdt,
    blockCode,
    blockReason,
    estimatedFeeUsdt,
    estimatedMarginUsdt,
    marginRate,
    projectedWatchState,
    reserveBudgetUsdt,
    spendableAfterEntryUsdt: bailoutGate.spendableAfterEntryUsdt,
    spendableUsdt,
    totalRequiredUsdt,
  };
}

const entryFunding = {
  plan: {
    calculate: calculateEntryFundingPlan,
  },
  requestedMargin: {
    resolve: resolveRequestedMarginUsdt,
  },
} as const;

export default entryFunding;
