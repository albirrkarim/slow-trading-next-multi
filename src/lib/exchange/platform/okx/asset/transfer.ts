import { requestPrivate } from "../utils";

/**
 * OKX Transfer Response
 */
export interface TransferResponse {
    code: string;
    msg: string;
    data: Array<{
        transId: string; // Transfer ID
        ccy: string;
        from: string;
        to: string;
        amt: string;
        clientId: string;
    }>;
}

/**
 * Account types for transfer
 * 6: Funding
 * 18: Trading
 */
export enum AccountType {
    FUNDING = "6",
    TRADING = "18",
}

/**
 * Transfer funds between accounts
 * 
 * @param ccy - Currency, e.g., "USDT"
 * @param amt - Amount to transfer
 * @param from - From account type (6: Funding, 18: Trading)
 * @param to - To account type (6: Funding, 18: Trading)
 * @returns Promise resolving to transfer response
 */
export async function transferFunds(
    ccy: string,
    amt: string,
    from: AccountType,
    to: AccountType
): Promise<TransferResponse> {
    const body = {
        ccy,
        amt,
        from,
        to,
    };

    return requestPrivate<TransferResponse>("/api/v5/asset/transfer", body, "POST");
}
