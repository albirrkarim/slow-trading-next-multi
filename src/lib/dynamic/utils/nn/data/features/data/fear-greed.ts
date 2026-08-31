import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { timeMsToReadable } from "@/lib/datasets/utils";
import md5 from "md5";
import { tradeLog } from "@/lib/trading/helper/log";

export interface FearGreedPoint {
  timeMs: number;
  value: number;
  label: string;
}

interface FetchFearGreedOptions {
  simpleTime?: "1year" | "2year" | "5year" | "10year" | "max";
  startTimeMs?: number;
  endTimeMs?: number;
  limit?: number; // max number of points to fetch (default 1825)
  useCache?: boolean;
}

/**
 * Fetch Fear & Greed Index from Alternative.me API with caching and flexible time options.
 *
 * Cache is valid for 1 day, stored at: storage/nn/market/cache/
 */
export async function fetchFearGreedIndex(
  options: FetchFearGreedOptions = {},
): Promise<FearGreedPoint[]> {
  const cacheDir = path.resolve("storage/nn/market/cache");
  await fs.ensureDir(cacheDir);

  const useCache = options.useCache ?? true;

  // Determine time range
  const now = Date.now();
  const endTimeMs = options.endTimeMs ?? now;

  let startTimeMs: number;
  if (options.startTimeMs) {
    startTimeMs = options.startTimeMs;
  } else if (options.simpleTime && options.simpleTime !== "max") {
    const years =
      options.simpleTime === "1year"
        ? 1
        : options.simpleTime === "2year"
          ? 2
          : options.simpleTime === "5year"
            ? 5
            : options.simpleTime === "10year"
              ? 10
              : 0;
    const past = new Date(endTimeMs);
    past.setFullYear(past.getFullYear() - years);
    startTimeMs = past.getTime();
  } else {
    startTimeMs = 0; // max history
  }

  const limit = options.limit ?? 1825;

  // Create cache filename based on params
  const cacheFile = path.join(
    cacheDir,
    `fear_greed_${md5(
      JSON.stringify({
        limit,
        simple: options.simpleTime,
      }),
    ).substring(0, 5)}.json`,
  );

  // --- Try cache first ---
  if (useCache && (await fs.exists(cacheFile))) {
    const stat = await fs.stat(cacheFile);
    const ageMs = Date.now() - stat.mtimeMs;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (ageMs < oneDayMs) {
      const cached = await fs.readJson(cacheFile);
      return cached as FearGreedPoint[];
    } else {
      await fs.remove(cacheFile);
    }
  }

  try {
    const days = Math.ceil((endTimeMs - startTimeMs) / (1000 * 60 * 60 * 24));
    const fetchLimit = Math.min(limit, days);

    const url = `https://api.alternative.me/fng/?limit=${fetchLimit}&format=json`;
    const res = await axios.get(url);

    const data = res.data.data as {
      value: string;
      timestamp: string;
      value_classification: string;
    }[];

    const filtered = data
      .map((point) => ({
        timeMs: parseInt(point.timestamp, 10) * 1000,
        timeHuman: timeMsToReadable(parseInt(point.timestamp, 10) * 1000),
        value: parseInt(point.value, 10),
        label: point.value_classification,
      }))
      .filter((p) => p.timeMs >= startTimeMs && p.timeMs <= endTimeMs)
      .sort((a, b) => a.timeMs - b.timeMs);

    // --- Save to cache ---
    await fs.writeJson(cacheFile, filtered);

    return filtered;
  } catch (err: any) {
    tradeLog.error("Failed to fetch Fear & Greed Index:", err.message);
    return [];
  }
}
