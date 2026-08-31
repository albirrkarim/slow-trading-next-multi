import { requestPublic } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * OKX Instrument Data
 */
export interface Instrument {
    instType: string; // "SPOT", "SWAP", etc.
    instId: string; // "BTC-USDT"
    baseCcy: string; // "BTC"
    quoteCcy: string; // "USDT"
    lotSz: string; // Minimum order size (quantity)
    minSz: string; // Minimum order size
    tickSz: string; // Price tick size
    state: string; // "live", "suspend"
}

export interface GetInstrumentsResponse {
    code: string;
    msg: string;
    data: Instrument[];
}

/**
 * Fetch instruments
 * @param instType - Instrument type (SPOT, SWAP, FUTURES, OPTION)
 * @param instId - Optional specific instrument ID
 */
export async function getInstruments(
    instType: "SPOT" | "SWAP" | "FUTURES" | "OPTION" = "SPOT",
    instId?: string
): Promise<Instrument[]> {
    const params: Record<string, string> = {
        instType,
    };
    if (instId) {
        params.instId = instId;
    }

    const response = await requestPublic<GetInstrumentsResponse>(
        "/api/v5/public/instruments",
        params
    );

    if (response.code !== "0" || !response.data) {
        tradeLog.error("Error fetching instruments:", response.msg);
        return [];
    }

    return response.data;
}

/**
 * Get instrument info for a specific symbol
 */
export async function getInstrumentInfo(instId: string): Promise<Instrument | null> {
    let type: "SPOT" | "SWAP" | "FUTURES" | "OPTION" = "SPOT";
    if (instId.includes("-SWAP")) type = "SWAP";
    else if (instId.includes("-FUTURES")) type = "FUTURES";
    else if (instId.includes("-C") || instId.includes("-P")) type = "OPTION";

    // Try fetching specific instrument
    const instruments = await getInstruments(type, instId);
    if (instruments.length > 0) return instruments[0];
    return null;
}
