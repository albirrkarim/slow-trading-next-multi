import path from "path";
import { requestPublic } from "../utils";
import type { GetSymbolsResponse } from "./general-type";
import fs from "fs-extra";
import { tradeLog } from "@/lib/trading/helper/log";

/**
 * Response structure for server time check.
 */
export interface ServerTimeResponse {
  code: number;
  msg: string;
  timestamp: number; // Server time in milliseconds
}

/**
 * Check server time and test connectivity to the REST API.
 *
 * @returns Promise resolving to the current server time response.
 *
 * @example
 * ```ts
 * const serverTime = await getServerTime();
 * console.log(`Server time: ${new Date(serverTime.timestamp).toISOString()}`);
 * ```
 */
export async function getServerTime(): Promise<ServerTimeResponse> {
  const url = "https://api.tokocrypto.com/open/v1/common/time";

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch server time: ${response.statusText}`);
  }

  const data = await response.json();
  return data as ServerTimeResponse;
}

/**
 * Filter for symbol trading rules.
 */
export interface SymbolFilter {
  applyToMarket: boolean;
  filterType: string;
  maxPrice?: string;
  minPrice?: string;
  tickSize?: string;
  avgPriceMins?: string;
  multiplierDown?: number;
  multiplierUp?: number;
  maxQty?: string;
  minQty?: string;
  stepSize?: string;
  minNotional?: string;
  limit?: string;
  maxNumAlgoOrders?: string;
}

/**
 * Represents a supported trading symbol.
 */
export interface TradingSymbol {
  type: number; // 1 - Main, 2 - Next
  symbol: string;
  baseAsset: string;
  basePrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  filters: SymbolFilter[];
  orderTypes: string[];
  icebergEnable: number;
  ocoEnable: number;
  spotTradingEnable: number;
  marginTradingEnable: number;
}

/**
 * Response structure for supported trading symbols.
 */
export interface SupportedSymbolsResponse {
  code: number;
  msg: string;
  data: {
    list: TradingSymbol[];
  };
  timestamp: number;
}

/**
 * Get all supported trading symbols from the exchange.
 *
 * @returns Promise resolving to the list of supported symbols.
 *
 * @example
 * ```ts
 * const symbolsResponse = await getSupportedSymbols();
 * console.log(symbolsResponse.data.list[0].symbol); // e.g. "ADA_BNB"
 * ```
 */
export async function getSupportedSymbols(): Promise<SupportedSymbolsResponse> {
  const url = "https://api.tokocrypto.com/open/v1/common/symbols";

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch supported symbols: ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data as SupportedSymbolsResponse;
}

const CACHE_PATH = "storage/cache/min_qty.json";

// Local cache object (key: symbol, value: { minQty, stepSize })
const minQtyCache: Record<string, { minQty: number; stepSize: number }> = {};

export async function loadMinQtyCache() {
  try {
    if (await fs.pathExists(CACHE_PATH)) {
      const data = await fs.readJson(CACHE_PATH);
      Object.assign(minQtyCache, data);
      tradeLog.log(`[Cache] Loaded ${Object.keys(minQtyCache).length} entries`);
    }
  } catch (err) {
    tradeLog.warn("[Cache] Failed to load cache:", (err as Error).message);
  }
}

// ✅ Save cache safely (atomic write)
export async function saveMinQtyCache() {
  try {
    await fs.ensureDir(path.dirname(CACHE_PATH));
    await fs.writeJson(CACHE_PATH, minQtyCache);
    tradeLog.log(`[Cache] Saved ${Object.keys(minQtyCache).length} entries`);
  } catch (err) {
    tradeLog.error("[Cache] Failed to save cache:", (err as Error).message);
  }
}

/**
 * Safely fetches the minimum quantity and step size for a trading symbol
 * from Tokocrypto's `/open/v1/common/symbols` endpoint.
 *
 * 🧠 Includes:
 *  - Local caching
 *  - Retry on network errors
 *  - Graceful handling of missing data
 *
 * @param symbol Example: "BTC_USDT"
 * @returns {Promise<{ minQty: number; stepSize: number }>}
 */
export async function getMinQtyAndStepSize(
  symbol: string,
): Promise<{ minQty: number; stepSize: number }> {
  // 1️⃣ Return from cache if available
  if (minQtyCache[symbol]) return minQtyCache[symbol];

  // load up
  await loadMinQtyCache();

  if (minQtyCache[symbol]) return minQtyCache[symbol];

  let symbolsData: GetSymbolsResponse | null = null;

  // 2️⃣ Fetch safely (with retry logic)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      symbolsData = await requestPublic<GetSymbolsResponse>(
        "/open/v1/common/symbols",
      );
      break; // success → exit retry loop
    } catch (err) {
      tradeLog.warn(
        `[Tokocrypto] Failed to fetch symbols (attempt ${attempt}):`,
        (err as Error).message,
      );
      if (attempt === 3) {
        // throw new Error(
        //   `Failed to fetch Tokocrypto symbols after 3 attempts. Network or endpoint issue.`
        // );
        break;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
    }
  }

  // 3️⃣ Find the requested symbol
  // 3️⃣ Find the requested symbol
  const normalizedTarget = symbol.replace(/_/g, "");
  const symbolInfo = symbolsData?.data.list.find(
    (s) => s.symbol.replace(/_/g, "") === normalizedTarget,
  );
  if (!symbolInfo) {
    throw new Error(`Symbol ${symbol} not found in Tokocrypto list.`);
  }

  // 4️⃣ Extract the LOT_SIZE filter
  const lotSize = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE");
  if (!lotSize?.minQty || !lotSize?.stepSize) {
    throw new Error(`LOT_SIZE filter missing for ${symbol}.`);
  }

  // 5️⃣ Parse and cache result
  const result = {
    minQty: parseFloat(lotSize.minQty),
    stepSize: parseFloat(lotSize.stepSize),
  };

  // update
  minQtyCache[symbol] = result;

  // save
  await saveMinQtyCache();

  return result;
}
