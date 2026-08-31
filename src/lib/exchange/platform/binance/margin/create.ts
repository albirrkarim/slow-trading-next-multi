import { requestPrivate } from "../utils";
import type { OrderSide, TimeInForce } from "../order/create";
import { OrderType } from "../order/create";

/**
 * Parameters for creating a margin order on Binance
 */
export interface CreateMarginOrderParams {
  /** Trading pair symbol, e.g., "BTCUSDT" */
  symbol: string;

  /** Order side: BUY or SELL */
  side: OrderSide;

  /** Order type: LIMIT, MARKET, etc. */
  type: OrderType;

  /** Time in force (required for LIMIT orders) */
  timeInForce?: TimeInForce;

  /** Quantity of base asset to trade */
  quantity?: string;

  /** Quantity in quote asset to spend (for MARKET BUY only) */
  quoteOrderQty?: string;

  /** Price per unit (required for LIMIT orders) */
  price?: string;

  /** Client-defined order ID */
  newClientOrderId?: string;

  /** Side effect type: NO_SIDE_EFFECT, MARGIN_BUY, AUTO_REPAY */
  sideEffectType?: "NO_SIDE_EFFECT" | "MARGIN_BUY" | "AUTO_REPAY";

  /** Is isolated margin (true) or cross margin (false) */
  isIsolated?: boolean;

  /** Recv window (optional) */
  recvWindow?: number;

  /** Timestamp (auto-generated if not provided) */
  timestamp?: number;
}

/**
 * Response type for margin order creation
 */
export interface CreateMarginOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  marginBuyBorrowAmount?: string;
  marginBuyBorrowAsset?: string;
  isIsolated?: boolean;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

/**
 * Creates a new margin order on Binance
 *
 * API Documentation: https://binance-docs.github.io/apidocs/spot/en/#margin-account-new-order-trade
 *
 * @param params - Order parameters
 * @returns Promise resolving to order creation response
 */
export async function createMarginOrder(
  params: CreateMarginOrderParams
): Promise<CreateMarginOrderResponse> {
  // Validate limit orders have price and timeInForce
  if (params.type === OrderType.LIMIT || params.type === OrderType.LIMIT_MAKER) {
    if (!params.price) {
      throw new Error("Limit orders require a price");
    }
    if (!params.timeInForce) {
      throw new Error("Limit orders require timeInForce");
    }
  }

  const body: Record<string, any> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
  };

  // Add optional parameters
  if (params.quantity) body.quantity = params.quantity;
  if (params.quoteOrderQty) body.quoteOrderQty = params.quoteOrderQty;
  if (params.price) body.price = params.price;
  if (params.timeInForce) body.timeInForce = params.timeInForce;
  if (params.newClientOrderId) body.newClientOrderId = params.newClientOrderId;
  if (params.sideEffectType) body.sideEffectType = params.sideEffectType;
  if (params.isIsolated !== undefined) body.isIsolated = params.isIsolated;
  if (params.recvWindow) body.recvWindow = params.recvWindow;
  if (params.timestamp) body.timestamp = params.timestamp;

  return requestPrivate<CreateMarginOrderResponse>(
    "/sapi/v1/margin/order",
    body,
    "post"
  );
}

