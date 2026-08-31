import { requestPrivate } from "../utils";

/**
 * Cancel order parameters
 */
export interface CancelOrderParams {
  instId: string;
  ordId?: string;
  clOrdId?: string;
}

export interface CancelOrderResponse {
  code: string;
  msg: string;
  data: Array<{
    ordId: string;
    clOrdId: string;
    sCode: string; // "0" means success
    sMsg: string;
  }>;
}

/**
 * Cancel an order
 * 
 * @param params - Parameters to cancel order
 */
export async function cancelOrder(
  params: CancelOrderParams
): Promise<CancelOrderResponse> {
  // Validate params
  if (!params.ordId && !params.clOrdId) {
    throw new Error("Either ordId or clOrdId is required to cancel an order");
  }

  const body: Record<string, string> = {
    instId: params.instId,
  };
  if (params.ordId) body.ordId = params.ordId;
  if (params.clOrdId) body.clOrdId = params.clOrdId;

  return requestPrivate<CancelOrderResponse>(
    "/api/v5/trade/cancel-order",
    body,
    "POST"
  );
}
