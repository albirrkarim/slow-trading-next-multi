import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

export interface AccountConfiguration {
    uid: string;
    acctLv: string; // "1": Simple, "2": Single-currency margin, "3": Multi-currency margin, "4": Portfolio margin
    posMode: string; // "long_short_mode": Hedge, "net_mode": One-way
    autoLoan: boolean;
    greeksType: string;
    level: string;
    levelTmp: string;
    mgnIsoMode: string; // "automatic", "quick_margin"
    spotOffsetType: string;
    roleType: string; // "0": general user
}

export interface GetAccountConfigResponse {
    code: string;
    msg: string;
    data: AccountConfiguration[];
}

/**
 * Get Account Configuration
 * See: https://www.okx.com/docs-v5/en/#account-account-get-account-configuration
 */
export async function getAccountConfiguration(): Promise<AccountConfiguration | null> {
    const response = await requestPrivate<GetAccountConfigResponse>(
        "/api/v5/account/config",
        {}, // params
        "GET" // method
    );

    if (response.code !== "0" || !response.data || response.data.length === 0) {
        tradeLog.error("Error fetching account config:", response.msg);
        return null;
    }

    return response.data[0];
}

/**
 * Set Account Configuration (Level)
 * See: https://www.okx.com/docs-v5/en/#account-account-set-account-configuration
 * @param acctLv - "1": Simple, "2": Single-currency margin, "3": Multi-currency margin
 */
export async function setAccountLevel(acctLv: "1" | "2" | "3"): Promise<boolean> {
    const response = await requestPrivate<{ code: string; msg: string; data: any[] }>(
        "/api/v5/account/set-account-level",
        { acctLv },
        "POST"
    );

    if (response.code === "0") {
        tradeLog.log(`✅ Account Level set to ${acctLv} successfully.`);
        return true;
    } else {
        tradeLog.error(`Failed to set Account Level to ${acctLv}:`, response.msg);
        // Common error: "Account level requirement not met" -> usually means quiz not passed
        return false;
    }
}

/**
 * Set Leverage
 * See: https://www.okx.com/docs-v5/en/#account-account-set-leverage
 * @param instId - Instrument ID (e.g. BTC-USDT-SWAP)
 * @param lever - Leverage multiple (e.g. "10")
 * @param mgnMode - Margin mode: "isolated" or "cross"
 * @returns boolean success
 */
export async function setLeverage(instId: string, lever: string, mgnMode: "isolated" | "cross"): Promise<boolean> {
    const response = await requestPrivate<{ code: string; msg: string; data: any[] }>(
        "/api/v5/account/set-leverage",
        {
            instId,
            lever,
            mgnMode
        },
        "POST"
    );

    if (response.code === "0") {
        return true;
    } else {
        tradeLog.error(`Failed to set leverage for ${instId}: ${response.msg}`);
        return false;
    }
}
