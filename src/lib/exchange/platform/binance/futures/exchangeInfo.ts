import axios from "axios";
import { tradeLog } from "@/lib/trading/helper/log";

const FUTURES_BASE_URL = "https://fapi.binance.com";

interface Filter {
  filterType: string;
  minQty?: string;
  stepSize?: string;
  tickSize?: string;
}

interface SymbolInfo {
  symbol: string;
  filters: Filter[];
}

interface ExchangeInfo {
  symbols: SymbolInfo[];
}

const cache: Record<
  string,
  { minQty: number; stepSize: number; tickSize: number }
> = {};

export async function getFuturesSymbolInfo(
  symbol: string
): Promise<{ minQty: number; stepSize: number; tickSize: number } | null> {
  // Return cached if available
  if (cache[symbol]) return cache[symbol];

  try {
    // Fetch specific symbol info to be lighter? Binace Futures exchangeInfo usually returns all.
    // We can't filter by symbol in query param for exchangeInfo usually.
    // Cache could be populated for all, but for now just fetch.
    // Actually, let's just fetch once and cache.
    const res = await axios.get(`${FUTURES_BASE_URL}/fapi/v1/exchangeInfo`);
    const data: ExchangeInfo = res.data;

    const symbolInfo = data.symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) return null;

    const lotSizeFilter = symbolInfo.filters.find(
      (f) => f.filterType === "LOT_SIZE"
    );

    const priceFilter = symbolInfo.filters.find(
      (f) => f.filterType === "PRICE_FILTER"
    );

    if (lotSizeFilter) {
      const result = {
        minQty: parseFloat(lotSizeFilter.minQty || "0"),
        stepSize: parseFloat(lotSizeFilter.stepSize || "0"),
        tickSize: parseFloat(priceFilter?.tickSize || "0"),
      };
      cache[symbol] = result;
      return result;
    }
    return null;
  } catch (e) {
    tradeLog.error("Failed to fetch futures exchange info", e);
    return null;
  }
}
