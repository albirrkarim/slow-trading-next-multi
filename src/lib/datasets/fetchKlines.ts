import fs from "fs-extra";
import path from "path";
import { type Kline, INTERVAL_MS_MAP } from "@lib/exchange/platform/tokocrypto";
import { delay } from "@lib/exchange/platform/tokocrypto/utils";
import { type FetchKlinesFunctionProps } from "./type";
import { timeMsToReadable } from "./utils";
import { tradeLog } from "@lib/trading";
import { getExchange } from "@/lib/exchange";
import { MAX_KLINES_PER_CALL } from "../exchange/constants";
import binanceRequestCoordinator from "@/lib/exchange/platform/binance/request-coordinator";

const MAX_FETCH_ATTEMPTS = 3;

function isInvalidSymbolError(error: any): boolean {
  return (
    error?.response?.data?.code === -1121 ||
    error?.code === -1121 ||
    error?.message?.includes("Invalid symbol")
  );
}

/**
 * Fetches candlestick (kline) data for a given symbol and interval from Tokocrypto API.
 * Supports filtering an existing dataset, or downloading in batches within a time range.
 * The function can optionally save the result to a JSON file with a timestamped filename.
 *
 * @param {FetchKlinesFunctionProps} props - Configuration options for fetching klines.
 * @param {Kline[]} [props.klines] - Optional existing kline dataset to filter instead of fetching from API.
 * @param {string} [props.simpleTime] - Time range shorthand (e.g., '15minute', '2week') used to compute duration in minutes.
 * @param {number} [props.minutes] - Number of minutes to fetch (overrides `simpleTime` if both provided).
 * @param {number} [props.startTime] - Start timestamp in milliseconds (used with `endTime` or `minutes`).
 * @param {number} [props.endTime] - End timestamp in milliseconds (used with `startTime` or now).
 * @param {string} props.symbol - Trading symbol to fetch data for (e.g., 'BTCUSDT').
 * @param {string} [props.interval='1m'] - Candle interval (e.g., '1m', '1h', '1d').
 * @param {number} [props.symbolType=1] - Symbol type identifier (specific to API requirements).
 * @param {string} [props.folder='storage/datasets'] - Folder path where file will be saved if `saveToFile` is true.
 * @param {boolean} [props.saveToFile=false] - Whether to save the fetched klines to a file.
 * @param {boolean} [props.verbose=true] - Whether to log progress and batch status to the tradeLog.
 * @param {ExchangeType} [props.exchangeType='tokocrypto'] - Exchange type to fetch data from.
 *
 * @returns {Promise<Kline[]>} Resolves to an array of kline data points.
 *
 * @throws {Error} Throws an error if:
 *  - Neither `minutes` nor `startTime`/`endTime` are provided to define a time range.
 *  - `symbol` is not provided.
 *  - An invalid `simpleTime` format is used.
 *  - The interval is unsupported.
 */
export async function fetchKlinesFunction(
  props: FetchKlinesFunctionProps,
): Promise<Kline[]> {
  const {
    klines,
    simpleTime,
    symbol,
    interval = "1m",
    saveToFile = false,
    exactDate = true,
    useCache = true,
    verbose = false,
    onProgress,
    signal,
    folder = "storage/datasets",
    marketType,
  } = props;

  let { exchangeType = "binance" } = props;
  const exchangeTypeForce = props.exchangeTypeForce;

  let { minutes, startTime, endTime } = props;

  signal?.throwIfAborted();

  if (!exchangeTypeForce) {
    // quick fix for okx, okx sucks for historical data
    if (exchangeType === "okx") {
      exchangeType = "binance";
    }
  }

  // A. Convert simpleTime to minutes
  if (simpleTime && !minutes && !simpleTime.includes("to")) {
    const match = simpleTime.match(/^(\d+)(minute|hour|day|week|month|year)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2];
      const unitToMinutes: Record<string, number> = {
        minute: 1,
        hour: 60,
        day: 1440,
        week: 10080,
        month: 43200,
        year: 525600,
      };
      minutes = num * unitToMinutes[unit];
    } else {
      throw new Error(`Invalid simpleTime format: ${simpleTime}`);
    }
  }

  // B. Calculate time range
  if (minutes !== undefined) {
    if (endTime === undefined) {
      endTime = Date.now();
    }

    startTime = endTime - minutes * 60_000;
  }

  if (startTime === undefined || endTime === undefined) {
    throw new Error(
      "Cannot determine time range. Provide 'minutes' or both 'startTime' and 'endTime'.",
    );
  }

  const fileNameBase = `${symbol}_${interval}_${simpleTime ?? minutes + "min"}`;

  const readableStart = timeMsToReadable(startTime);
  const readableEnd = timeMsToReadable(endTime);

  const fileName = `${fileNameBase}${
    exactDate ? `_from_${readableStart}_to_${readableEnd}` : ""
  }.json`;

  const outputFile = path.resolve(folder, fileName);

  if (saveToFile) {
    await fs.ensureDir(path.dirname(outputFile));

    if ((await fs.exists(outputFile)) && useCache) {
      const data = await fs.readJSON(outputFile);
      signal?.throwIfAborted();
      tradeLog.debug("USING CACHE ", fileNameBase);
      onProgress?.({ completedBatches: 1, percent: 100, totalBatches: 1 });
      return data;
    }
  }

  // C. Return filtered klines if already available
  if (klines) {
    const start = klines.findIndex((e) => e[0] >= startTime);
    const end = klines.findLastIndex((e) => e[0] <= endTime);

    // tradeLog.log("start ", start);
    // tradeLog.log("klines ", klines);

    // if (start > 0) {
    const filtered = klines.slice(start, end + 1);

    if (start == -1 || end == -1) {
      tradeLog.warn("Cache Klines not found! ", { start, end });
      tradeLog.log(
        "REQUEST TO CROP from ",
        timeMsToReadable(startTime),
        " to ",
        timeMsToReadable(endTime),
      );

      const first = klines[0][0];
      const last = klines.at(-1)?.[0] ?? 0;
      if (last) {
        tradeLog.log(
          "BUT CACHE ONLY from ",
          timeMsToReadable(first),
          " to ",
          timeMsToReadable(last),
        );
      }
    }

    // Save to file if needed
    if (saveToFile) {
      const last = filtered.at(-1);
      if (last) {
        await fs.ensureDir(path.dirname(outputFile));

        await fs.writeJson(outputFile, filtered);
        tradeLog.log(`✅ Saved ${filtered.length} candles to ${outputFile}`);
      } else {
        tradeLog.error("Error saving klines!");
      }
    }

    return filtered;
  }

  // D. Get real live data

  if (!symbol) throw new Error("Missing 'symbol' to fetch klines.");
  const intervalMs = INTERVAL_MS_MAP[interval];
  if (!intervalMs) throw new Error(`Unsupported interval: ${interval}`);

  tradeLog.debug(
    `Get real live data startTime: ${timeMsToReadable(
      startTime,
    )} - endTime: ${timeMsToReadable(endTime)} ${interval}`,
  );

  if (startTime > endTime) {
    throw new Error(
      `Start time must less than end time | startTime: ${timeMsToReadable(
        startTime,
      )} - endTime: ${timeMsToReadable(endTime)}`,
    );
  }

  // Use Unified Exchange Library
  const exchange = getExchange(exchangeType);

  const maxPerCall = MAX_KLINES_PER_CALL[exchangeType];
  let currentStart = startTime;
  const result: Kline[] = [];

  let chunkIndex = 0;
  const totalBatches = Math.max(
    1,
    Math.ceil((endTime - startTime) / (intervalMs * maxPerCall)),
  );

  while (currentStart < endTime) {
    signal?.throwIfAborted();
    const currentEnd = Math.min(
      currentStart + intervalMs * maxPerCall,
      endTime,
    );

    let batch: Kline[] = [];
    let attempts = 0;
    const maxAttempts = MAX_FETCH_ATTEMPTS;

    while (attempts < maxAttempts) {
      signal?.throwIfAborted();
      try {
        batch = await exchange.getKlines({
          symbol,
          interval,
          startTime: currentStart,
          endTime: currentEnd,
          marketType,
        });

        break; // success
      } catch (err: any) {
        attempts++;
        const invalidSymbol = isInvalidSymbolError(err);
        const rateLimited =
          binanceRequestCoordinator.error.isRateLimit(err);
        const retryable =
          binanceRequestCoordinator.error.isRetryable(err);
        const delayMs = 1_000 * 2 ** (attempts - 1);
        tradeLog.warn(
          `${symbol} ⚠️ Error fetching batch ${chunkIndex + 1}: ${
            err.code || err.message
          } (attempt ${attempts}/${maxAttempts})`,
        );
        if (invalidSymbol) {
          tradeLog.error(
            `${symbol} ❌ Exchange rejected the symbol as invalid, skipping remaining retries for this batch.`,
          );
          break;
        }
        if (rateLimited || !retryable) {
          throw err;
        }
        if (attempts >= maxAttempts) {
          tradeLog.error(
            `${symbol} ❌ Failed after ${maxAttempts} attempts.`,
          );
          throw err;
        }
        await delay(delayMs);
      }
    }

    if (!batch.length) {
      // Handle new coins that may not have data at the requested startTime
      // Skip forward by one chunk instead of breaking entirely
      if (result.length === 0) {
        tradeLog.debug(
          `${symbol} No candles at ${new Date(currentStart).toISOString()}, skipping forward...`,
        );
        currentStart = currentEnd;
        chunkIndex++;

        onProgress?.({
          completedBatches: chunkIndex,
          percent: Math.min(
            100,
            Math.round(((currentEnd - startTime) / (endTime - startTime)) * 100),
          ),
          totalBatches,
        });

        // if (batch.length > 10) {
        await delay(300);
        // }

        continue;
      }

      tradeLog.warn(`${symbol} No candles returned, stopping early.`, {
        exchangeType,
        params: {
          symbol,
          interval,
          startTime: currentStart,
          endTime: currentEnd,
        },
      });
      break;
    }

    result.push(...batch);
    chunkIndex++;

    onProgress?.({
      completedBatches: chunkIndex,
      percent: Math.min(
        100,
        Math.round(((currentEnd - startTime) / (endTime - startTime)) * 100),
      ),
      totalBatches,
    });

    if (verbose) {
      const progress = Math.min(
        100,
        Math.round(((currentEnd - startTime) / (endTime - startTime)) * 100),
      );
      tradeLog.log(
        `${symbol} ✅ Fetched batch ${chunkIndex}: ${batch.length} candles [${progress}%]`,
      );
    }

    // only if batch is more than 100 candles
    // if (batch.length > 50) {
    await delay(300); // rate limit safety
    // }

    currentStart = batch[batch.length - 1][0] + intervalMs;
  }

  tradeLog.debug(`${symbol} ✅ Fetched ${result.length} candles`);
  tradeLog.debug("saveToFile ", saveToFile);

  // Save to file if needed
  if (saveToFile) {
    const last = result.at(-1);
    if (last) {
      // ✅ Ensure the directory exists before writing
      await fs.ensureDir(path.dirname(outputFile));

      await fs.writeJson(outputFile, result);
      tradeLog.log(`✅ Saved ${result.length} candles to ${outputFile}`);
    } else {
      tradeLog.error("Error saving klines!");
    }
  }

  return result;
}
