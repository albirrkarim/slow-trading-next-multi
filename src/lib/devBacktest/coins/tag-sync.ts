import axios from "axios";

import type { CoinTagState } from "./tag-types";
import { tradeLog } from "@/lib/trading";

const SYNC_HEADER = "x-coin-metadata-sync-token";
const MANUAL_SYNC_PEERS = [
  "https://fast.reinventwp.com",
  "https://holy.reinventwp.com",
  "https://wealth.reinventwp.com",
];

export interface CoinMetadataSyncBroadcastResult {
  error?: string;
  peer: string;
  status?: number;
  success: boolean;
}

function normalizePeerUrls(peerUrls: string[]) {
  const peers = new Map<string, string>();
  for (const peerUrl of peerUrls) {
    const peer = peerUrl.trim().replace(/\/+$/, "");
    if (peer) peers.set(peer.toLocaleLowerCase(), peer);
  }
  return [...peers.values()];
}

function parsePeerUrls() {
  return normalizePeerUrls(
    String(process.env.COIN_METADATA_SYNC_PEERS ?? "").split(","),
  );
}

function getSyncToken() {
  return String(process.env.SYNC_TOKEN ?? "").trim();
}

function isLocalAppName(appName = process.env.APP_NAME) {
  return String(appName ?? "").trim().toLocaleLowerCase() === "localhost";
}

function isAutomaticBroadcastEnabled() {
  return !isLocalAppName();
}

/** Returns true when a request is authenticated as peer metadata sync. */
export function isAuthorizedCoinMetadataSync(token: unknown) {
  const expectedToken = getSyncToken();
  return (
    expectedToken.length > 0 &&
    typeof token === "string" &&
    token === expectedToken
  );
}

/**
 * Broadcasts the full coin metadata state to explicit peer instances and
 * returns one result per target.
 */
export async function broadcastCoinMetadataSyncToPeers(
  state: CoinTagState,
  peerUrls: string[],
) {
  const token = getSyncToken();
  const peers = normalizePeerUrls(peerUrls);

  if (!token) {
    throw new Error("SYNC_TOKEN is required to broadcast coin metadata.");
  }

  if (peers.length === 0) {
    throw new Error("At least one coin metadata sync peer is required.");
  }

  const results: CoinMetadataSyncBroadcastResult[] = [];
  for (const peer of peers) {
    try {
      await axios.put(
        `${peer}/api/slow-trading/coin-metadata`,
        {
          syncState: state,
        },
        {
          headers: {
            [SYNC_HEADER]: token,
          },
          timeout: 10_000,
        },
      );
      results.push({ peer, success: true });
    } catch (error) {
      const requestError = error as {
        message?: string;
        response?: { data?: { error?: string }; status?: number };
      };
      tradeLog.log(error);
      results.push({
        error:
          requestError.response?.data?.error ??
          requestError.message ??
          "Coin metadata sync failed",
        peer,
        status: requestError.response?.status,
        success: false,
      });
    }
  }
  return results;
}

/**
 * Broadcasts the full coin metadata state to configured peer instances.
 */
export async function broadcastCoinMetadataSync(state: CoinTagState) {
  const token = getSyncToken();
  const peers = parsePeerUrls();

  if (!isAutomaticBroadcastEnabled() || !token || peers.length === 0) {
    return;
  }

  await broadcastCoinMetadataSyncToPeers(state, peers);
}

export const coinMetadataSync = {
  broadcast: broadcastCoinMetadataSync,
  broadcastToPeers: broadcastCoinMetadataSyncToPeers,
  manualPeers: MANUAL_SYNC_PEERS,
  header: SYNC_HEADER,
  isAutomaticBroadcastEnabled,
  isAuthorized: isAuthorizedCoinMetadataSync,
};
