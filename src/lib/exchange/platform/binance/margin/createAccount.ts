import { requestPrivate } from "../utils";
import { tradeLog } from "@/lib/trading/helper/log";
import binanceRequestCoordinator from "../request-coordinator";

/**
 * Enable Isolated Margin Account for a specific symbol
 * POST /sapi/v1/margin/isolated/create
 */
export async function createIsolatedMarginAccount(
  symbol: string,
): Promise<boolean> {
  try {
    const response = await requestPrivate<any>(
      "/sapi/v1/margin/isolated/create",
      { symbol },
      "post",
    );
    tradeLog.log("Create Account Response:", JSON.stringify(response));
    // If we're here, it didn't throw 4xx/5xx.
    // Some endpoints might return empty body or different structure.
    // Assume success if no error.
    return (response && response.success) !== false;
  } catch (error: any) {
    if (binanceRequestCoordinator.error.isRateLimit(error)) throw error;
    // If it's already created or other acceptable errors, we might want to handle them.
    // However, usually if it exists we wouldn't be calling this.
    // Code -11001 means account does not exist.
    // Code -20002 means default (if success is false)
    tradeLog.warn(
      `Failed to create isolated margin account for ${symbol}`,
      error.message,
    );
    if (error.response)
      tradeLog.log("Error details:", JSON.stringify(error.response.data));
    return false;
  }
}
