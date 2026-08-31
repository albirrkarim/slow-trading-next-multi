import type {
  ExchangeEnsureClosedParams,
  ExchangeEnsureClosedResult,
  IExchange,
  UnifiedPosition,
} from "./types";
import {
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
} from "./types";

const DEFAULT_CONFIRMATION_DELAY_MS = 5_000;
const DEFAULT_RESIDUAL_RETRY_COUNT = 1;

/** Normalizes a trading symbol for exchange-position comparison. */
function normalizeSymbol(value: unknown): string {
  return String(value ?? "")
    .replace(/[-_/]/g, "")
    .trim()
    .toUpperCase();
}

/** Finds the exchange position matching the requested symbol and direction. */
function findOpenPosition(params: {
  direction: ExchangeEnsureClosedParams["direction"];
  positions: UnifiedPosition[];
  symbol: string;
}): UnifiedPosition | undefined {
  const symbol = normalizeSymbol(params.symbol);
  return params.positions.find(
    (position) =>
      normalizeSymbol(position.symbol || position.originalSymbol) === symbol &&
      position.side === params.direction &&
      Number.isFinite(position.amount) &&
      position.amount > 0,
  );
}

/** Waits for the exchange position state to settle. */
function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Confirms an exit and submits one exact reduce-only residual close when the
 * exchange still reports the futures position after its settlement delay.
 */
async function ensureClosed(
  exchange: Pick<IExchange, "createOrder" | "getPositions">,
  params: ExchangeEnsureClosedParams,
): Promise<ExchangeEnsureClosedResult> {
  let retryOrders = 0;

  for (
    let attempt = 0;
    attempt <= DEFAULT_RESIDUAL_RETRY_COUNT;
    attempt += 1
  ) {
    await wait(DEFAULT_CONFIRMATION_DELAY_MS);
    const remainingPosition = findOpenPosition({
      direction: params.direction,
      positions: await exchange.getPositions(params.symbol),
      symbol: params.symbol,
    });

    if (!remainingPosition) {
      return { closed: true, remainingAmount: 0, retryOrders };
    }

    if (attempt === DEFAULT_RESIDUAL_RETRY_COUNT) {
      return {
        closed: false,
        remainingAmount: remainingPosition.amount,
        retryOrders,
      };
    }

    await exchange.createOrder({
      tradeType: "EXIT",
      symbol: params.symbol,
      side:
        params.direction === "SHORT"
          ? UnifiedOrderSide.BUY
          : UnifiedOrderSide.SELL,
      type: UnifiedOrderType.MARKET,
      quantity: remainingPosition.amount,
      tradingMode: TradingMode.FUTURES,
      reduceOnly: true,
    });
    retryOrders += 1;
  }

  return { closed: false, remainingAmount: 0, retryOrders };
}

const exchangeExit = {
  defaults: {
    confirmationDelayMs: DEFAULT_CONFIRMATION_DELAY_MS,
    residualRetryCount: DEFAULT_RESIDUAL_RETRY_COUNT,
  },
  ensureClosed,
  position: {
    findOpen: findOpenPosition,
  },
} as const;

export default exchangeExit;
