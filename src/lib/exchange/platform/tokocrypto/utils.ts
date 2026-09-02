import axios, { type AxiosRequestConfig } from "axios";
import crypto from "crypto";
import moment from "moment";
import { BASE_URL } from "./config";
import { tradeLog } from "@lib/trading";
import { getCurrentExchangeAccountSlug } from "@/lib/exchange/account-context";
import { getTokocryptoCredentials } from "@/lib/exchange/credentials";
import { requestPublic as requestBinancePublic } from "@/lib/exchange/platform/binance/utils";
// import path from "path";
// import fs from "fs-extra";

export async function delay(ms: number = 1100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// contain all market analysis function
/**
 * Generates a SHA-256 HMAC signature from a query string using API_SECRET.
 * @param query - The query string to sign.
 * @returns The HMAC signature.
 */
function getSignature(query: string): string {
  const accountSlug = getCurrentExchangeAccountSlug();
  const creds = getTokocryptoCredentials(accountSlug);
  return crypto
    .createHmac("sha256", creds.apiSecret)
    .update(query)
    .digest("hex");
}

/**
 * Converts an object into a URL query string.
 * @param params - The parameters object.
 * @returns A URL query string.
 */
function generateQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .map(([key, val]) => `${key}=${val}`)
    .join("&");
}

// async function saveToFile(endpoint: string, data: any): Promise<void> {
//   // Save to file
//   const slug = endpoint.replace(/\//g, "_").replace(/^_/, "");
//   const filePath = path.join("storage", `${slug}.json`);
//   await fs.ensureDir(path.dirname(filePath));
//   await fs.writeJson(filePath, data);
// }

/**
 * Sends a signed request to a private endpoint.
 * @param endpoint - API endpoint path.
 * @param param - Request parameters.
 * @param method - HTTP method ('get' or 'post').
 * @param domain - Optional custom domain (defaults to BASE_URL).
 * @returns API response data.
 */
export async function requestPrivate<T>(
  endpoint: string,
  param: Record<string, any>,
  method: "get" | "post",
  domain = BASE_URL,
): Promise<T> {
  try {
    const accountSlug = getCurrentExchangeAccountSlug();
    const creds = getTokocryptoCredentials(accountSlug);

    param.recvWindow = 5000;
    param.timestamp = moment().valueOf();
    const queryString = generateQueryString(param);
    param.signature = getSignature(queryString);

    const config: AxiosRequestConfig = {
      headers: {
        "X-MBX-APIKEY": creds.apiKey,
      },
      params: param,
    };

    const url = `${domain}${endpoint}`;
    const response =
      method === "get"
        ? await axios.get(url, config)
        : await axios.post(url, null, config);

    const data = response.data;

    // await saveToFile(endpoint, data);
    if (data.code !== 0) {
      tradeLog.log("response", data);
      throw new Error(data.msg);
    }

    return data;
  } catch (error: any) {
    const errorData = error.response?.data;
    const errorMessage = errorData
      ? errorData.msg || errorData.message || JSON.stringify(errorData)
      : error.message;

    tradeLog.error(
      `Tokocrypto Private Request Error [${endpoint}]:`,
      errorMessage,
    );
    throw new Error(errorMessage);
  }
}

/**
 * Sends a request to a public endpoint.
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
  if (new URL(domain).hostname.endsWith("binance.com")) {
    return requestBinancePublic<T>(endpoint, params, domain);
  }

  try {
    const response = await axios.get(`${domain}${endpoint}`, { params });
    const data = response.data;

    // await saveToFile(endpoint, data);

    return data;
  } catch (error: any) {
    tradeLog.error("endpoint ", endpoint);
    const errorData = error.response?.data;
    const errorMessage = errorData
      ? errorData.msg || errorData.message || JSON.stringify(errorData)
      : error.message;

    // console.error(error.response?.data || error.message);
    throw new Error(errorMessage);
  }
}
