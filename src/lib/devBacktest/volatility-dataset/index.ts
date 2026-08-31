import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import type { CommonTime, VolatilityPoint } from "@/lib/dynamic";
import { detectVolatilityPoints } from "@/lib/dynamic";
import type { ExchangeType } from "@/lib/exchange";
import fs from "fs-extra";
import path from "path";

const WARMUP_RANGES = ["5year", "4year", "3year", "2year", "1year", "6month"];

interface LoadParams {
  symbols: string[];
  interval: string;
  range: string;
  startTime?: number;
  endTime?: number;
  useCache?: boolean;
  exchangeType: ExchangeType;
  marketType: "SPOT" | "FUTURES";
  warmupMs?: number;
}

interface CacheMetadata {
  interval?: string;
  marketType?: string;
  t0?: number;
  t1?: number;
}

function getPaths(exchangeType: ExchangeType, range: string, symbol: string) {
  const folder = `${VOLATILITY_FOLDER}/${exchangeType}/${range}`;
  return {
    data: path.join(folder, `${symbol}.json`),
    metadata: path.join(folder, ".meta", `${symbol}.json`),
  };
}

async function readCompatibleCache(params: {
  exchangeType: ExchangeType;
  interval: string;
  marketType: "SPOT" | "FUTURES";
  range: string;
  symbol: string;
}): Promise<VolatilityPoint[] | null> {
  const paths = getPaths(params.exchangeType, params.range, params.symbol);
  if (!(await fs.pathExists(paths.data)) || !(await fs.pathExists(paths.metadata))) {
    return null;
  }

  const metadata = (await fs.readJson(paths.metadata)) as CacheMetadata;
  if (
    metadata.interval !== params.interval ||
    metadata.marketType !== params.marketType
  ) {
    return null;
  }

  return (await fs.readJson(paths.data)) as VolatilityPoint[];
}

async function createCache(params: LoadParams & { symbol: string }) {
  const klines = await fetchKlinesFunction({
    endTime: params.endTime,
    exchangeType: params.exchangeType,
    exchangeTypeForce: true,
    interval: params.interval as any,
    marketType: params.marketType,
    saveToFile: false,
    simpleTime: params.range,
    startTime: params.startTime,
    symbol: `${params.symbol}_USDT`,
    useCache: false,
    verbose: true,
  });
  const points = detectVolatilityPoints({ klines, symbol: params.symbol });
  const paths = getPaths(params.exchangeType, params.range, params.symbol);
  await fs.ensureDir(path.dirname(paths.data));
  await fs.writeJson(paths.data, points);
  await fs.ensureDir(path.dirname(paths.metadata));
  await fs.writeJson(paths.metadata, {
    interval: params.interval,
    marketType: params.marketType,
    t0: klines[0]?.[0],
    t1: klines.at(-1)?.[0],
  });
  return points;
}

function cropPoints(
  points: VolatilityPoint[],
  startTime?: number,
  endTime?: number,
) {
  return points.filter(
    (point) =>
      (startTime === undefined || point.t >= startTime) &&
      (endTime === undefined || point.t <= endTime),
  );
}

async function loadWarmup(params: LoadParams, symbol: string, before: number) {
  if (!params.warmupMs) return [];

  for (const range of WARMUP_RANGES) {
    const points = await readCompatibleCache({ ...params, range, symbol });
    if (!points?.length) continue;
    const warmup = points.filter(
      (point) =>
        point.t < before && point.t >= before - params.warmupMs!,
    );
    if (warmup.length > 0) return warmup;
  }

  return [];
}

/** Loads compact volatility events and creates only a volatility cache when missing. */
async function load(params: LoadParams): Promise<{
  commonTime: CommonTime;
  volatilityMap: Record<string, VolatilityPoint[]>;
  warmupMap: Record<string, VolatilityPoint[]>;
}> {
  const loaded: Record<string, VolatilityPoint[]> = {};
  for (const symbol of params.symbols) {
    const cached = params.useCache
      ? await readCompatibleCache({ ...params, symbol })
      : null;
    const points = cached ?? (await createCache({ ...params, symbol }));
    loaded[symbol] = cropPoints(points, params.startTime, params.endTime);
    if (loaded[symbol].length === 0) {
      throw new Error(`No volatility points found for ${symbol} in ${params.range}`);
    }
  }

  const commonStart = Math.max(
    ...Object.values(loaded).map((points) => points[0].t),
  );
  const commonEnd = Math.min(
    ...Object.values(loaded).map((points) => points.at(-1)!.t),
  );
  if (commonStart > commonEnd) {
    throw new Error("Selected symbols do not share a common volatility time range");
  }

  const volatilityMap: Record<string, VolatilityPoint[]> = {};
  const warmupMap: Record<string, VolatilityPoint[]> = {};
  for (const symbol of params.symbols) {
    volatilityMap[symbol] = cropPoints(loaded[symbol], commonStart, commonEnd);
    warmupMap[symbol] = await loadWarmup(params, symbol, commonStart);
  }
  const commonLength = new Set(
    Object.values(volatilityMap).flatMap((points) =>
      points.map((point) => point.t),
    ),
  ).size;

  return {
    commonTime: { commonEnd, commonLength, commonStart },
    volatilityMap,
    warmupMap,
  };
}

const volatilityDataset = {
  load,
  paths: {
    get: getPaths,
  },
};

export default volatilityDataset;
import { VOLATILITY_FOLDER } from "@/components/api/constants";
