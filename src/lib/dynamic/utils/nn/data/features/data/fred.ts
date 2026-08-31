import dotenv from "dotenv";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { timeMsToReadable } from "@/lib/datasets/utils";
import md5 from "md5";

dotenv.config();

interface FredObservation {
  date: string;
  value: string;
}

export interface FredDataPoint {
  timeMs: number;
  timeHuman: string;
  value: number;
}

interface FetchFredOptions {
  startDate?: string;
  endDate?: string;
  frequency?: "m" | "q" | "sa" | "a";
  simpleTime?: "1year" | "2year" | "5year" | "10year" | "20year" | "max";
  useCache?: boolean;
}

/**
 * Fetch a FRED series with optional caching.
 */
export async function fetchFredSeries(
  seriesId: string,
  options: FetchFredOptions = {},
): Promise<FredDataPoint[]> {
  const apiKey = process.env.FRED_API;
  if (!apiKey) throw new Error("Missing FRED_API in .env");

  const cacheDir = path.resolve("storage/nn/market/cache");
  await fs.ensureDir(cacheDir);

  const useCache = options.useCache ?? true;
  const cacheFile = path.join(
    cacheDir,
    `${seriesId}- ${md5(
      JSON.stringify({
        start: options.startDate,
        end: options.endDate,
        freq: options.frequency,
        time: options.simpleTime,
      }),
    ).substring(0, 5)}.json`,
  );

  // Check cache
  if (useCache && (await fs.pathExists(cacheFile))) {
    const stat = await fs.stat(cacheFile);
    const ageMs = Date.now() - stat.mtimeMs;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (ageMs < oneDayMs) {
      // Cache valid
      const cached = await fs.readJson(cacheFile);
      return cached as FredDataPoint[];
    } else {
      // Cache expired → delete it
      await fs.remove(cacheFile);
    }
  }

  // --- Determine defaults ---
  const now = new Date();
  const endDate = options.endDate ?? now.toISOString().split("T")[0];
  const timePreset = options.simpleTime ?? "5year";

  // --- Derive start date ---
  let startDate = options.startDate;
  if (!startDate && timePreset !== "max") {
    const years =
      timePreset === "1year"
        ? 1
        : timePreset === "2year"
          ? 2
          : timePreset === "5year"
            ? 5
            : timePreset === "10year"
              ? 10
              : timePreset === "20year"
                ? 20
                : 0;

    if (years > 0) {
      const past = new Date(now);
      past.setFullYear(now.getFullYear() - years);
      startDate = past.toISOString().split("T")[0];
    }
  }

  // --- Construct request params ---
  const params: Record<string, string> = {
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    ...(startDate && { observation_start: startDate }),
    ...(endDate && { observation_end: endDate }),
    ...(options.frequency && { frequency: options.frequency }),
  };

  try {
    const res = await axios.get<{ observations: FredObservation[] }>(
      "https://api.stlouisfed.org/fred/series/observations",
      { params },
    );

    const data = removeConsecutiveDuplicates(
      res.data.observations
        .map((o) => ({
          timeMs: new Date(o.date).getTime(),
          timeHuman: timeMsToReadable(new Date(o.date).getTime()),
          value: parseFloat(o.value),
        }))
        .filter((o) => !isNaN(o.value)),
    );

    // --- Save to cache ---
    await fs.writeJson(cacheFile, data);

    return data;
  } catch (err: any) {
    throw new Error(
      `Failed to fetch FRED series ${seriesId}: ${
        err.response?.data?.error_message ||
        err.response?.statusText ||
        err.message
      }`,
    );
  }
}

function removeConsecutiveDuplicates(data: FredDataPoint[]) {
  return data.filter(
    (point, i) => i === 0 || point.value !== data[i - 1].value,
  );
}
