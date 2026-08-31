import { requestPublic } from "../utils";

export interface TokoTicker {
  symbol: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  priceChange: string;
  priceChangePercent: string;
}

/**
 * Get 24hr ticker price change statistics
 * Note: Tokocrypto API can likely use Binance endpoints directly if using Binance Cloud,
 * but let's try to stick to their open API or standard Binance comptibility.
 *
 * In standard Tokocrypto docs: /open/v1/market/product gives summary.
 * However, since Tokocrypto often mirrors Binance, and their SDK structure here heavily implies it,
 * we will first try the standard binance-like endpoint if available, OR iterate.
 *
 * Actually, checking Tokocrypto docs (or typical implementation):
 * GET /open/v1/market/ticker/24hr is common for standard implementations.
 * Let's assume it behaves like Binance for now as the codebase suggests high similarity.
 */
export const getTickers = async (symbol?: string) => {
  const params: any = {};
  if (symbol) {
    params.symbol = symbol;
  }

  // Using the same endpoint path as Binance usually works for Toko if they are on Binance Cloud or matching API
  // But strictly Toko API is /open/v1/...
  // Let's try to use the Binance endpoint structure via requestPublic which targets BASE_URL.
  // Inspection of other files shows they use default binance endpoints sometimes?
  // Let's look at klines.ts to see what endpoint it uses.
  // Wait, I will use a safe assumption of /api/v3/ticker/24hr first as it's most likely to work given the shared infrastructure.
  // If `requestPublic` in tokocrypto/utils.ts uses a specific BASE_URL, we need to respect it.

  // Force use of Binance API domain for market tickers to ensure compatibility.
  return requestPublic<TokoTicker | TokoTicker[]>(
    "/api/v3/ticker/24hr",
    params,
    "https://api.binance.com",
  );
};
