import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import fs from "fs-extra";
import path from "path";

interface CropKlinesToCommonRangeProps {
  datasetMap: Record<string, string>;
  tempPath: string;
  useCache?: boolean;
}

export interface CommonTime {
  commonStart: number;
  commonEnd: number;
  commonLength: number;
}

/**
 * Efficiently finds a common time range across multiple datasets,
 * then crops each dataset individually to that range and saves it
 * to the provided `tempPath`.
 *
 * This method avoids loading all datasets into memory at once.
 *
 * @async
 * @function cropKlinesToCommonRange
 * @param {Record<string, string>} datasetMap - A mapping of coin symbols to their JSON file paths.
 * @param {string} tempPath - Directory where cropped datasets will be saved.
 * @returns {Promise<{ commonStart: number, commonEnd: number }>} - The final common start and end timestamps.
 *
 * @throws {Error} If a file cannot be read or saved.
 *
 * @example
 * ```ts
 * const datasetMap = {
 *   DOGE: "storage/datasets/WATCH/DOGE.json",
 *   SOL:  "storage/datasets/WATCH/SOL.json",
 *   SUI:  "storage/datasets/WATCH/SUI.json"
 * };
 *
 * const result = await cropKlinesToCommonRange(datasetMap, "storage/datasets/DYNAMIC");
 * console.log(result);
 * // { commonStart: 1691953200000, commonEnd: 1723406400000 }
 * ```
 */
export async function cropKlinesToCommonRange({
  datasetMap,
  tempPath,
  useCache = true,
}: CropKlinesToCommonRangeProps): Promise<CommonTime> {
  if (useCache) {
    let allExist = true;
    for (const coin of Object.keys(datasetMap)) {
      const outputFile = path.join(tempPath, `${coin}.json`);
      if (!(await fs.exists(outputFile))) {
        allExist = false;
      }
    }

    if (allExist) {
      const arr = Object.values(datasetMap);
      if (arr.length > 0) {
        const filePath = arr[0];
        const klines = (await fs.readJson(filePath)) as Kline[];

        if (klines.length > 0) {
          const first = klines[0][0];
          const last = klines.at(-1)?.[0];

          return {
            commonStart: first,
            commonEnd: last ?? 0,
            commonLength: klines.length,
          };
        }
      }

      return {
        commonStart: 0,
        commonEnd: 0,
        commonLength: 0,
      };
    }
  }

  let globalStart = Number.MIN_SAFE_INTEGER;
  let globalEnd = Number.MAX_SAFE_INTEGER;

  // Ensure temp directory exists
  await fs.ensureDir(tempPath);

  // 1. Scan files to determine global common time range
  for (const [coin, filePath] of Object.entries(datasetMap)) {
    const absPath = path.resolve(filePath);

    if (!(await fs.exists(absPath))) {
      throw new Error(`File not found for ${coin}: ${absPath}`);
    }

    const klines: Kline[] = await fs.readJSON(absPath);

    if (klines.length === 0) {
      throw new Error(`Dataset for ${coin} is empty: ${absPath}`);
    }

    const start = klines[0][0]; // First candle's open time
    const end = klines[klines.length - 1][0]; // Last candle's open time

    // Update global start and end to find overlap
    globalStart = Math.max(globalStart, start);
    globalEnd = Math.min(globalEnd, end);
  }

  // console.log(
  //   `Common Time Range: ${new Date(globalStart)} -> ${new Date(globalEnd)}`
  // );

  let commonLength = 0;

  // 2. Crop and save each dataset individually
  for (const [coin, filePath] of Object.entries(datasetMap)) {
    const absPath = path.resolve(filePath);
    const klines: Kline[] = await fs.readJSON(absPath);

    // Filter klines to only those within the common time range
    const cropped = klines.filter(
      (kline) => kline[0] >= globalStart && kline[0] <= globalEnd,
    );

    commonLength = cropped.length;
    const outputFile = path.join(tempPath, `${coin}.json`);
    await fs.writeJSON(outputFile, cropped);

    // console.log(`Saved cropped dataset for ${coin} -> ${outputFile}`);
  }

  return { commonStart: globalStart, commonEnd: globalEnd, commonLength };
}
