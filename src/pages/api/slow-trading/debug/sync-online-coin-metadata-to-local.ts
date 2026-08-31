import type { NextApiRequest, NextApiResponse } from "next";

import type { CoinTagState } from "@/lib/devBacktest/coins/tag-types";
import coinTags from "@/lib/devBacktest/coins/tags";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

const DEFAULT_ONLINE_BASE_URL = "https://fast.reinventwp.com";

interface SyncOnlineCoinMetadataBody {
  onlineBaseUrl?: string;
}

function normalizeBaseUrl(input: string | undefined) {
  return (input || DEFAULT_ONLINE_BASE_URL).trim().replace(/\/+$/, "");
}

/**
 * Downloads coin metadata from another same-code deployment and replaces local
 * tags, tag descriptions, coin descriptions, and coin/tag assignments.
 */
async function downloadOnlineCoinMetadata(
  onlineBaseUrl: string,
): Promise<CoinTagState> {
  const response = await fetch(
    `${onlineBaseUrl}/api/slow-trading/coin-metadata`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Online coin metadata download failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as CoinTagState;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
      return;
    }

    const host = req.headers.host;
    if (!slowTrading.debugSync.isLocalPersistentStorageSyncAllowed(host)) {
      res.status(403).json({
        error:
          "Online coin metadata download is only allowed from localhost outside Railway.",
      });
      return;
    }

    const body = (req.body ?? {}) as SyncOnlineCoinMetadataBody;
    const onlineBaseUrl = normalizeBaseUrl(body.onlineBaseUrl);
    const onlineState = await downloadOnlineCoinMetadata(onlineBaseUrl);
    const state = coinTags.replace(onlineState);

    res.status(200).json({
      onlineBaseUrl,
      state,
    });
  } catch (error: any) {
    await slowTrading.storage.logs
      .appendError({
        source: "api.slow-trading.debug.sync-online-coin-metadata-to-local",
        error,
        details: {
          method: req.method,
        },
      })
      .catch((logError) => {
        tradeLog.error(
          "[slow-trading] failed to write coin metadata sync error log",
          logError,
        );
      });

    res.status(500).json({
      error:
        error?.message ?? "Failed to download online coin metadata to local",
    });
  }
}
