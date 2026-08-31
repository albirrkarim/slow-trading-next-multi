import { requestPrivate } from "../utils";

export * from "./accountInformation";
export * from "./accountAsset";

/**
 * Starts a user data stream session.
 *
 * @returns {Promise<any>} Promise resolving to stream information.
 */
export async function userDataStream(): Promise<any> {
  return await requestPrivate("/open/v1/user-data-stream", {}, "post");
}

/**
 * Gets the deposit address for a specific asset and network.
 *
 * @param {string} asset - Asset symbol (e.g., 'BTC').
 * @param {string} network - Network name (e.g., 'BTC', 'BEP20').
 * @returns {Promise<any>} Promise resolving to deposit address information.
 */
export async function depositAddress(
  asset: string,
  network: string
): Promise<any> {
  return await requestPrivate(
    "/open/v1/deposits/address",
    { asset: asset.toUpperCase(), network },
    "get"
  );
}

/**
 * Gets deposit history with optional filtering parameters.
 *
 * @param {Record<string, any>} [params={}] - Optional filter parameters.
 * @returns {Promise<any>} Promise resolving to deposit records.
 */
export async function depositHistory(
  params: Record<string, any> = {}
): Promise<any> {
  return await requestPrivate("/open/v1/deposits", params, "get");
}

/**
 * Gets withdrawal history with optional filtering parameters.
 *
 * @param {Record<string, any>} [params={}] - Optional filter parameters.
 * @returns {Promise<any>} Promise resolving to withdrawal records.
 */
export async function withdrawHistory(
  params: Record<string, any> = {}
): Promise<any> {
  return await requestPrivate("/open/v1/withdraws", params, "get");
}
