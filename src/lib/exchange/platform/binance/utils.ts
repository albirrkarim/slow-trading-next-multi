import axios, { type AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { BASE_URL } from "./config";
import { tradeLog } from "@lib/trading";
import { getCurrentExchangeAccountSlug } from "@/lib/exchange/account-context";
import { getBinanceCredentials } from "@/lib/exchange/credentials";
import binanceRequestCoordinator, {
  BinanceApiError,
  BinanceCooldownError,
} from "./request-coordinator";

export { BinanceApiError, BinanceCooldownError } from "./request-coordinator";

export async function delay(ms: number = 1100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const url = `${domain}${endpoint}`;
    const response = await binanceRequestCoordinator.request.run(
      {
        domain,
        endpoint,
        kind: "private",
        params: param,
      },
      () => {
        const signedParams = {
          ...param,
          recvWindow: 5000,
          timestamp: Date.now(),
        };
        const queryString = generateQueryString(signedParams);
        const signature = getSignature(queryString, creds.apiSecret);
        const signedQueryString = `${queryString}&signature=${signature}`;
        const config: AxiosRequestConfig = {
          headers: {
            "X-MBX-APIKEY": creds.apiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        };

        if (method === "get") {
          return axios.get<T>(`${url}?${signedQueryString}`, config);
        }
        if (method === "delete") {
          return axios.delete<T>(`${url}?${signedQueryString}`, config);
        }
        if (options.postParamsInQuery) {
          return axios.post<T>(
            `${url}?${signedQueryString}`,
            undefined,
            config,
          );
        }

        return axios.post<T>(url, signedQueryString, config);
      },
    );

    const data = response.data;

    return data;
  } catch (error: any) {
    if (error instanceof BinanceCooldownError) throw error;

    const errorData = error.response?.data;
    const errorMessage = errorData?.msg || errorData?.message || error.message;
    const errorCode =
      errorData?.code !== undefined ? ` (code: ${errorData.code})` : "";

    tradeLog.error("Binance API Error:", errorData || error.message);

    if (errorData) {
      throw new BinanceApiError(
        `Binance API Error: ${errorMessage}${errorCode}`,
        {
          code: errorData.code,
          status: error.response?.status,
        },
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
  options: {
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const url = `${domain}${endpoint}`;
  try {
    const response = await binanceRequestCoordinator.request.run(
      {
        domain,
        endpoint,
        kind: "public",
        params,
      },
      () =>
        axios.get<T>(url, {
          params,
          ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
        }),
    );
    return response.data;
  } catch (error: any) {
    if (error instanceof BinanceCooldownError) throw error;

    const errorData = error.response?.data;
    const errorMessage = errorData?.msg || errorData?.message || error.message;
    const errorCode =
      errorData?.code !== undefined ? ` (code: ${errorData.code})` : "";

    tradeLog.error("Binance Public API Error:", errorData || error.message, {
      url,
      params,
    });
    if (errorData) {
      throw new BinanceApiError(
        `Binance Public API Error: ${errorMessage}${errorCode}`,
        {
          code: errorData.code,
          status: error.response?.status,
        },
      );
    }
    throw error;
  }
}
