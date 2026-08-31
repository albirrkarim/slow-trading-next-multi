import { BinanceApiError, requestPrivate } from "../utils";

/**
 * Set Leverage for Futures Symbol
 * POST /fapi/v1/leverage
 *
 * @throws {BinanceApiError} When Binance rejects the account configuration.
 */
export async function setFuturesLeverage(
  symbol: string,
  leverage: number,
): Promise<boolean> {
  const FUTURES_BASE_URL = "https://fapi.binance.com";
  await requestPrivate<any>(
    "/fapi/v1/leverage",
    { symbol, leverage },
    "post",
    FUTURES_BASE_URL,
  );
  return true;
}

/**
 * Change Margin Type (ISOLATED or CROSSED)
 * POST /fapi/v1/marginType
 *
 * @throws {BinanceApiError} When Binance rejects the account configuration.
 */
export async function setFuturesMarginType(
  symbol: string,
  marginType: "ISOLATED" | "CROSSED",
): Promise<boolean> {
  try {
    const FUTURES_BASE_URL = "https://fapi.binance.com";
    await requestPrivate<any>(
      "/fapi/v1/marginType",
      { symbol, marginType },
      "post",
      FUTURES_BASE_URL,
    );
    return true;
  } catch (error: unknown) {
    // If "No need to change margin type" (code -4046), it's success
    if (error instanceof BinanceApiError && Number(error.code) === -4046) {
      return true;
    }

    throw error;
  }
}
