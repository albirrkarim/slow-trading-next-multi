import axios, { type AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { BASE_URL } from "./config";
import { getCurrentExchangeAccountId } from "@/lib/exchange/account-context";
import { getOKXCredentials } from "@/lib/exchange/credentials";
import { tradeLog } from "@/lib/trading/helper/log";

export async function delay(ms: number = 1100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates OKX signature for authentication
 * Signature = Base64(HMAC-SHA256(timestamp + method + requestPath + body, secretKey))
 *
 * @param timestamp - ISO timestamp
 * @param method - HTTP method (GET, POST, etc.)
 * @param requestPath - API endpoint path with query params
 * @param body - Request body (empty string for GET)
 * @returns Base64 encoded signature
 */
function getSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  apiSecret: string,
  body: string = "",
): string {
  const message = timestamp + method + requestPath + body;
  const hmac = crypto.createHmac("sha256", apiSecret);
  return hmac.update(message).digest("base64");
}

/**
 * Gets current ISO timestamp for OKX API
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Converts an object into a URL query string
 */
function generateQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([_, val]) => val !== undefined && val !== null)
    .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
    .join("&");
}

/**
 * Sends a signed request to a private OKX endpoint
 *
 * @param endpoint - API endpoint path (e.g., "/api/v5/account/balance")
 * @param params - Request parameters
 * @param method - HTTP method ('GET' or 'POST')
 * @param domain - Optional custom domain (defaults to BASE_URL)
 * @returns API response data
 */
export async function requestPrivate<T>(
  endpoint: string,
  params: Record<string, any> = {},
  method: "GET" | "POST" = "GET",
  domain = BASE_URL,
): Promise<T> {
  const url = `${domain}${endpoint}`;
  const body = method === "POST" ? JSON.stringify(params) : "";

  const accountId = getCurrentExchangeAccountId();
  const creds = getOKXCredentials(accountId);

  try {
    const timestamp = getTimestamp();
    const queryString =
      method === "GET" && Object.keys(params).length > 0
        ? "?" + generateQueryString(params)
        : "";
    const requestPath = endpoint + queryString;

    const signature = getSignature(
      timestamp,
      method,
      requestPath,
      creds.apiSecret,
      body,
    );

    const config: AxiosRequestConfig = {
      headers: {
        "OK-ACCESS-KEY": creds.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": creds.passphrase,
        "Content-Type": "application/json",
      },
    };

    const response =
      method === "GET"
        ? await axios.get(url + queryString, config)
        : await axios.post(url, body, config);

    return response.data;
  } catch (error: any) {
    // show URL
    tradeLog.log("URL:", url);
    tradeLog.log("Method:", method);
    tradeLog.log("Params:", params);
    tradeLog.log("Body:", body);
    tradeLog.error("OKX API Error:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sends a request to a public OKX endpoint
 *
 * @param endpoint - API endpoint path
 * @param params - Query parameters
 * @param domain - Optional custom domain (defaults to BASE_URL)
 * @returns API response data
 */
export async function requestPublic<T>(
  endpoint: string,
  params: Record<string, any> = {},
  domain = BASE_URL,
): Promise<T> {
  try {
    const response = await axios.get(`${domain}${endpoint}`, { params });
    return response.data;
  } catch (error: any) {
    tradeLog.error(
      "OKX Public API Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
}
