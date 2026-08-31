import { requestPrivate } from "../utils";
import type { OrderSide, TimeInForce } from "../order/create";
import { OrderType } from "../order/create";

/**
 * Parameters for creating a futures order on Binance
 */
export interface CreateFuturesOrderParams {
  /** Trading pair symbol, e.g., "BTCUSDT" */
  symbol: string;

  /** Order side: BUY or SELL */
  side: OrderSide;

  /** Order type: LIMIT, MARKET, etc. */
  type: OrderType;

  /** Position side: BOTH, LONG, SHORT */
  positionSide?: "BOTH" | "LONG" | "SHORT";

  /** Time in force (required for LIMIT orders) */
  timeInForce?: TimeInForce;

  /** Quantity of base asset to trade */
  quantity?: string;

  /** Price per unit (required for LIMIT orders) */
  price?: string;

  /** Reduce only (true to only reduce position, false to open new position) */
  reduceOnly?: boolean;

  /** Close position (true to close all positions) */
  closePosition?: boolean;

  /** Stop price (for STOP orders) */
  stopPrice?: string;

  /** Client-defined order ID */
  newClientOrderId?: string;

  /** Recv window (optional) */
  recvWindow?: number;

  /** Timestamp (auto-generated if not provided) */
  timestamp?: number;
}

/**
 * Response type for futures order creation
 */
export interface CreateFuturesOrderResponse {
  clientOrderId: string;
  cumQty: string;
  cumQuote: string;
  executedQty: string;
  orderId: number;
  avgPrice: string;
  origQty: string;
  price: string;
  reduceOnly: boolean;
  side: string;
  positionSide: string;
  status: string;
  stopPrice: string;
  closePosition: boolean;
  symbol: string;
  timeInForce: string;
  type: string;
  origType: string;
  activatePrice: string;
  priceRate: string;
  updateTime: number;
  workingType: string;
  priceProtect: boolean;
}

/**
 * Creates a new futures order on Binance
 *
 * API Documentation: https://binance-docs.github.io/apidocs/futures/en/#new-order-trade
 *
 * @param params - Order parameters
 * @returns Promise resolving to order creation response
 */
export async function createFuturesOrder(
  params: CreateFuturesOrderParams
): Promise<CreateFuturesOrderResponse> {
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
  if (params.positionSide) body.positionSide = params.positionSide;
  if (params.timeInForce) body.timeInForce = params.timeInForce;
  if (params.quantity) body.quantity = params.quantity;
  if (params.price) body.price = params.price;
  if (params.reduceOnly !== undefined) body.reduceOnly = params.reduceOnly;
  if (params.closePosition !== undefined) body.closePosition = params.closePosition;
  if (params.stopPrice) body.stopPrice = params.stopPrice;
  if (params.newClientOrderId) body.newClientOrderId = params.newClientOrderId;
  if (params.recvWindow) body.recvWindow = params.recvWindow;
  if (params.timestamp) body.timestamp = params.timestamp;

  // Binance Futures API uses different base URL
  const FUTURES_BASE_URL = "https://fapi.binance.com";

  return requestPrivate<CreateFuturesOrderResponse>(
    "/fapi/v1/order",
    body,
    "post",
    FUTURES_BASE_URL
  );
}

