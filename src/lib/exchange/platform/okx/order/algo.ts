import { requestPrivate } from "../utils";
import type { TradeMode, OrderSide } from "./create";

/**
 * Algo Order Type
 */
export enum AlgoOrderType {
  CONDITIONAL = "conditional",
  OCO = "oco",
  TRIGGER = "trigger",
  MOVE_ORDER_STOP = "move_order_stop",
  Iceberg = "iceberg",
  TWAP = "twap",
}

/**
 * Parameters for creating an Algo Order
 * https://www.okx.com/docs-v5/en/#rest-api-trade-place-algo-order
 */
export interface CreateAlgoOrderParams {
  instId: string;
  tdMode: TradeMode;
  side: OrderSide;
  ordType: AlgoOrderType;

  /** Quantity (optional if closeFraction is used) */
  sz?: string;

  /** Close Fraction (1 for 100%) */
  closeFraction?: string;

  /** Stop Loss Trigger Price */
  slTriggerPx?: string;

  /** Stop Loss Order Price (-1 for Market) */
  slOrdPx?: string;

  /** Take Profit Trigger Price */
  tpTriggerPx?: string;

  /** Take Profit Order Price (-1 for Market) */
  tpOrdPx?: string;

  /** Trigger Price (for conditional/trigger orders) */
  triggerPx?: string;

  /** Order Price (for conditional/trigger orders) */
  ordPx?: string;

  /** Position Side (long/short/net) */
  posSide?: "long" | "short" | "net";

  /** Reduce Only */
  reduceOnly?: boolean;
}

export interface CreateAlgoOrderResponse {
  code: string;
  msg: string;
  data: Array<{
    algoId: string;
    clOrdId: string;
    sCode: string;
    sMsg: string;
  }>;
}

/**
 * Create Algo Order (Stop Loss, Take Profit, Conditional)
 */
export async function createAlgoOrder(
  params: CreateAlgoOrderParams,
): Promise<CreateAlgoOrderResponse> {
  const body: Record<string, any> = {
    instId: params.instId,
    tdMode: params.tdMode,
    side: params.side,
    ordType: params.ordType,
  };

  if (params.sz) body.sz = params.sz;
  if (params.closeFraction) body.closeFraction = params.closeFraction;

  if (params.slTriggerPx) {
    body.slTriggerPx = params.slTriggerPx;
    body.slOrdPx = params.slOrdPx || "-1"; // Default to Market if not provided? Or required?
  }

  if (params.tpTriggerPx) {
    body.tpTriggerPx = params.tpTriggerPx;
    body.tpOrdPx = params.tpOrdPx || "-1";
  }

  // For plain 'conditional' stop order mapping
  if (params.triggerPx) body.triggerPx = params.triggerPx;
  if (params.ordPx) body.ordPx = params.ordPx;

  if (params.posSide) body.posSide = params.posSide;
  if (params.reduceOnly !== undefined) body.reduceOnly = params.reduceOnly;
  // For Trigger order, tag might be supported? Check docs. Usually yes.

  return requestPrivate<CreateAlgoOrderResponse>(
    "/api/v5/trade/order-algo",
    body,
    "POST",
  );
}

/**
 * OKX Algo Order Data
 */
export interface OKXAlgoOrder {
  algoId: string;
  instId: string;
  clOrdId: string;
  tdMode: string;
  side: string;
  ordType: string;
  sz: string;
  state: string;
  posSide: string;
  cTime: string;

  // Trigger/Order Prices
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  triggerPx?: string;
  ordPx?: string;

  // Additional fields if needed
  lastPx?: string;
  actualSz?: string;
  actualPx?: string;
}

/**
 * Get Open Algo Orders
 *
 * @param instId - Instrument ID (optional)
 * @param ordType - Algo Order Type (default: conditional)
 */
export async function getAlgoOpenOrders(
  instId?: string,
  ordType: string = "conditional",
): Promise<{ code: string; msg: string; data: OKXAlgoOrder[] }> {
  const params: Record<string, string> = {
    ordType,
  };

  if (instId) params.instId = instId;

  return requestPrivate<{ code: string; msg: string; data: OKXAlgoOrder[] }>(
    "/api/v5/trade/orders-algo-pending",
    params,
    "GET",
  );
}
