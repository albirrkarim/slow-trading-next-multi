import { requestPrivate } from "../utils";

export interface ClosePositionParams {
    instId: string;
    mgnMode: "cross" | "isolated";
    posSide?: "long" | "short" | "net";
    ccy?: string;
    autoCxl?: boolean; // Auto-cancel open orders
}

export interface ClosePositionResponse {
    code: string;
    msg: string;
    data: Array<{
        instId: string;
        posSide: string;
    }>;
}

/**
 * Close Position
 * API: POST /api/v5/trade/close-position
 */
export async function closePosition(params: ClosePositionParams): Promise<ClosePositionResponse> {
    const body: any = {
        instId: params.instId,
        mgnMode: params.mgnMode,
    };

    if (params.posSide) body.posSide = params.posSide;
    if (params.ccy) body.ccy = params.ccy;
    if (params.autoCxl) body.autoCxl = params.autoCxl;

    return requestPrivate<ClosePositionResponse>("/api/v5/trade/close-position", body, "POST");
}
