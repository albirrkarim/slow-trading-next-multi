import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Repayment parameters
 */
export interface RepaymentParams {
    /** Currency to repay (Debt Currency), e.g. "SUI" */
    ccy: string;
    /** Amount to repay. */
    amt?: string;
    /** Instrument ID, required for isolated margin, e.g. "SUI-USDT" */
    instId?: string;
    /** Margin mode: 'cross' or 'isolated' */
    mgnMode: "cross" | "isolated";
    /** Currency used for repayment (Collat/Payment Currency). Defaults to ccy. */
    repayCurrency?: string;
}

export interface RepaymentResponse {
    code: string;
    msg: string;
    data: Array<{
        ccy: string;
        amt: string;
        side: string; // "repay"
        instId?: string;
        mgnMode: string;
    }>;
}

/**
 * Repay margin loan using One-Click Repay
 * API: POST /api/v5/trade/one-click-repay
 */
export async function repay(params: RepaymentParams): Promise<RepaymentResponse> {
    const body: any = {
        debtCcy: params.ccy,
        repayCcy: params.repayCurrency || params.ccy,
        mgnMode: params.mgnMode,
    };

    if (params.instId) body.instId = params.instId;
    if (params.amt) body.repayAmt = params.amt;

    tradeLog.log("[OKX] One-Click Repay Body:", JSON.stringify(body));

    return requestPrivate<RepaymentResponse>("/api/v5/trade/one-click-repay", body, "POST");
}
