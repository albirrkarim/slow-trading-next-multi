import axios, { type AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { BASE_URL } from "./config";
import { tradeLog } from "@lib/trading";
import { getCurrentExchangeAccountSlug } from "@/lib/exchange/account-context";
import { getBinanceCredentials } from "@/lib/exchange/credentials";

export class BinanceApiError extends Error {
  readonly code?: number | string;

  constructor(message: string, code?: number | string) {
    super(message);
    this.name = "BinanceApiError";
    this.code = code;
  }
}

export async function delay(ms: number = 1100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple sequential rate limiter for Binance public API.
 * Ensures a minimum gap between consecutive requests to avoid IP bans.
 */
const publicRateLimiter = {
  lastRequestTime: 0,
  minGapMs: 350,
  queue: Promise.resolve() as Promise<any>,
};

/**
 * Generates a SHA-256 HMAC signature from a query string using API_SECRET.
 * @param query - The query string to sign.
 * @returns The HMAC signature.
 */
function getSignature(query: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
}

/**
 * Converts an object into a URL query string.
 * @param params - The parameters object.
 * @returns A URL query string.
 */
function generateQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([_, val]) => val !== undefined && val !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, val]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`,
    )
    .join("&");
}

/**
 * Sends a signed request to a private Binance endpoint.
 * @param endpoint - API endpoint path.
 * @param param - Request parameters.
 * @param method - HTTP method ('get' or 'post').
 * @param domain - Optional custom domain (defaults to BASE_URL).
 * @returns API response data.
 */
export async function requestPrivate<T>(
  endpoint: string,
  param: Record<string, any>,
  method: "get" | "post" | "delete",
  domain = BASE_URL,
  options: {
    /** Sends signed POST parameters in the URL for Binance SAPI endpoints that require it. */
    postParamsInQuery?: boolean;
  } = {},
): Promise<T> {
  try {
    const accountSlug = getCurrentExchangeAccountSlug();
    const creds = getBinanceCredentials(accountSlug);

    param.recvWindow = 5000;
    param.timestamp = Date.now();
    const queryString = generateQueryString(param);
    const signature = getSignature(queryString, creds.apiSecret);
    const signedQueryString = `${queryString}&signature=${signature}`;
    param.signature = signature;

    const config: AxiosRequestConfig = {
      headers: {
        "X-MBX-APIKEY": creds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    const url = `${domain}${endpoint}`;
    let response;
    if (method === "get") {
      response = await axios.get(`${url}?${signedQueryString}`, config);
    } else if (method === "delete") {
      response = await axios.delete(`${url}?${signedQueryString}`, config);
    } else if (options.postParamsInQuery) {
      response = await axios.post(`${url}?${signedQueryString}`, undefined, config);
    } else {
      // For POST, send the fully signed query string as the body
      const fullBody = signedQueryString;
      response = await axios.post(url, fullBody, config);
    }

    const data = response.data;

    return data;
  } catch (error: any) {
    const errorData = error.response?.data;
    const errorMessage = errorData?.msg || errorData?.message || error.message;
    const errorCode = errorData?.code ? ` (code: ${errorData.code})` : "";

    tradeLog.error("Binance API Error:", errorData || error.message);

    if (errorData) {
      throw new BinanceApiError(
        `Binance API Error: ${errorMessage}${errorCode}`,
        errorData.code,
      );
    }
    throw error;
  }
}

/**
 * Sends a request to a public Binance endpoint.
 * @param endpoint - API endpoint path.
 * @param params - Query parameters.
 * @param domain - Optional custom domain (defaults to BASE_URL).
 * @returns API response data.
 */
export async function requestPublic<T>(
  endpoint: string,
  params: Record<string, any> = {},
  domain = BASE_URL,
): Promise<T> {
  // Chain onto the queue so requests run sequentially with a minimum gap
  const result = publicRateLimiter.queue.then(async () => {
    const now = Date.now();
    const elapsed = now - publicRateLimiter.lastRequestTime;
    if (elapsed < publicRateLimiter.minGapMs) {
      await delay(publicRateLimiter.minGapMs - elapsed);
    }
    publicRateLimiter.lastRequestTime = Date.now();

    const url = `${domain}${endpoint}`;
    try {
      const response = await axios.get(url, { params });
      return response.data as T;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage =
        errorData?.msg || errorData?.message || error.message;
      const errorCode = errorData?.code ? ` (code: ${errorData.code})` : "";

      tradeLog.error("Binance Public API Error:", errorData || error.message, {
        url,
        params,
      });
      if (errorData) {
        throw new Error(
          `Binance Public API Error: ${errorMessage}${errorCode}`,
        );
      }
      throw error;
    }
  });

  // Always advance the queue (even on error) so it doesn't stall
  publicRateLimiter.queue = result.catch(() => {});

  return result;
}
