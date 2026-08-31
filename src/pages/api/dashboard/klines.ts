import { KLINES_FOLDER, makeScopedFolder } from "@/components/api/constants";
import type { MultiLinePair } from "@/components/api/dynamic";
import { FILES } from "@/components/storage";
import {
  convertVolatilityToLeveledMarkers,
  convertVolatilityToMarkers,
  type Marker,
  type LeveledMarkers,
} from "@/components/LiveDashboard/converter";
import { buildTradeMarkersFromHistory } from "@/components/LiveDashboard/Shared/trade-chart-markers";
import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import {
  detectVolatilityPoints,
  type PriceNorm,
  type VolatilityPoint,
} from "@/lib/dynamic";
import { windowsMs } from "@/lib/dynamic/constants-time";
import type { ExchangeType } from "@/lib/exchange";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import slowTrading from "@/lib/slowTrading";
import moment from "moment-timezone";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST" || req.method === "GET") {
    await getKlines(req, res);
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export interface getKlinesReturn {
  startKlines: string;
  endKlines: string;
  klines: Kline[];
  markers: Marker[];
  priceSeries: MultiLinePair;
  downRatioSeries: MultiLinePair;
  vPointsSeries: MultiLinePair;
}

function getPriceNorms({
  volatilityPoints,
}: {
  volatilityPoints: VolatilityPoint[];
}) {
  const times = [...new Set(volatilityPoints.map((item) => item.t))].sort(
    (a, b) => a - b,
  );
  const priceNorms: PriceNorm[] = [];

  for (const currentTimeMs of times) {
    const croppedVolatilityPoints = volatilityPoints.filter(
      (item) => item.t <= currentTimeMs,
    );
    const cutOff = currentTimeMs - windowsMs["1m"] * 6;
    const prices = croppedVolatilityPoints.map((item) => item.p);
    const price = prices.at(-1);

    if (!price) {
      continue;
    }

    const recentNorms = priceNorms.filter((item) => item.t > cutOff);
    const min = Math.min(...prices, ...recentNorms.map((item) => item.n));
    const max = Math.max(...prices, ...recentNorms.map((item) => item.x));

    priceNorms.push({
      t: currentTimeMs,
      x: max,
      n: min,
      c: parseFloat(((price - min) / (max - min || 1)).toFixed(2)),
    });
  }

  return priceNorms;
}

function getSharpDownRatio(data: PriceNorm[]): number {
  if (!data || data.length < 2) return 0;

  let totalMoveMagnitude = 0;
  let downMoveMagnitude = 0;

  for (let i = 1; i < data.length; i += 1) {
    const prev = data[i - 1];
    const curr = data[i];
    const diff = curr.c - prev.c;
    const absDiff = Math.abs(diff);

    if (absDiff === 0) continue;

    totalMoveMagnitude += absDiff;

    if (diff < 0) {
      downMoveMagnitude += absDiff * (absDiff > 0.05 ? 1.5 : 1);
    }
  }

  if (totalMoveMagnitude === 0) return 0;

  return Math.min(1, downMoveMagnitude / totalMoveMagnitude);
}

type DashboardVolatilitySource = "generated" | "storage";

function pickStringParam(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (item) => typeof item === "string" && item.trim().length > 0,
    );

    return typeof first === "string" ? first.trim() : undefined;
  }

  return undefined;
}

function pickVolatilitySource(value: unknown): DashboardVolatilitySource {
  return pickStringParam(value) === "storage" ? "storage" : "generated";
}

function pickBooleanParam(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }

  return false;
}

function pickMarketType(value: unknown): "SPOT" | "FUTURES" | undefined {
  const marketType = pickStringParam(value)?.toUpperCase();
  return marketType === "SPOT" || marketType === "FUTURES"
    ? marketType
    : undefined;
}

/**
 * Keeps persisted volatility points aligned with the visible kline window.
 */
export function filterVolatilityPointsForKlines(
  points: VolatilityPoint[],
  klines: Kline[],
): VolatilityPoint[] {
  const firstTime = Number(klines[0]?.[0]);
  const lastTime = Number(klines.at(-1)?.[0]);

  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
    return points;
  }

  return points.filter(
    (point) => point.t >= firstTime && point.t <= lastTime,
  );
}

/**
 * Reads dashboard volatility points from the SLOW persistent storage source.
 */
export async function getStoredDashboardVolatilityPoints({
  exchange,
  klines,
  symbol,
}: {
  exchange: ExchangeType;
  klines: Kline[];
  symbol: string;
}): Promise<VolatilityPoint[]> {
  // PROD:SAME_VOLATILITY_POINT
  const storedPoints = await FILES.slow.volatilityPoints.get(exchange, symbol);
  return filterVolatilityPointsForKlines(storedPoints, klines);
}

export async function getKlines(req: NextApiRequest, res: NextApiResponse) {
  const params = req.method == "GET" ? req.query : req.body;

  // Destructure from body
  const {
    symbol = "BTC",
    range = "1year",
    interval = "5m",
    upToDateKlines = false,
    volatility = false,
    volatilitySource,
    tradeHistory,
    startTime,
    endTime,
  } = params;

  const symbolParam = pickStringParam(symbol) ?? "BTC";
  const exchange = (pickStringParam(params.exchange) ??
    pickStringParam(params.exchangeType) ??
    DEFAULT_EXCHANGE) as ExchangeType;
  const marketType = pickMarketType(params.marketType);
  const selectedVolatilitySource = pickVolatilitySource(volatilitySource);
  const parsedStartTime =
    typeof startTime === "string" ? Number(startTime) : Number(startTime ?? 0);
  const parsedEndTime =
    typeof endTime === "string" ? Number(endTime) : Number(endTime ?? 0);
  const hasTimeWindow =
    Number.isFinite(parsedStartTime) &&
    Number.isFinite(parsedEndTime) &&
    parsedStartTime > 0 &&
    parsedEndTime > parsedStartTime;
  const rangeForFetch = hasTimeWindow
    ? `${moment.utc(parsedStartTime).format("DD_MMM_YYYY_HH_mm")}_to_${moment
        .utc(parsedEndTime)
        .format("DD_MMM_YYYY_HH_mm")}`
    : range;

  const TRADE_PAIR = `${symbolParam}_USDT`;

  let klines = await fetchKlinesFunction({
    symbol: TRADE_PAIR,
    interval,
    simpleTime: rangeForFetch,
    ...(hasTimeWindow
      ? {
          startTime: parsedStartTime,
          endTime: parsedEndTime,
        }
      : {}),
    folder: makeScopedFolder({
      range: rangeForFetch,
      interval,
      baseFolder:
        KLINES_FOLDER + "/" + exchange + (marketType ? `/${marketType}` : ""),
    }),
    saveToFile: false,
    exactDate: hasTimeWindow,
    useCache: !upToDateKlines,
    verbose: true,
    exchangeType: exchange,
    marketType,
  });

  if (hasTimeWindow) {
    klines = klines.filter(
      (item) => item[0] >= parsedStartTime && item[0] <= parsedEndTime,
    );
  }

  const data: getKlinesReturn = {
    startKlines: moment.utc(klines[0]?.[0]).format("YYYY-MM-DD HH:mm:ss"),
    endKlines: moment
      .utc(klines[klines.length - 1]?.[0])
      .format("YYYY-MM-DD HH:mm:ss"),
    klines,
    markers: [],
    priceSeries: {
      series: [],
      names: [],
    },
    downRatioSeries: {
      series: [],
      names: [],
    },
    vPointsSeries: {
      series: [],
      names: [],
    },
  };

  // Volatility markers
  if (volatility) {
    const markers: Marker[] = [];

    const volatilityPoints =
      selectedVolatilitySource === "storage"
        ? await getStoredDashboardVolatilityPoints({
            exchange,
            klines,
            symbol: symbolParam,
          })
        : detectVolatilityPoints({ klines, symbol: symbolParam });

    const vMarkers = convertVolatilityToMarkers(volatilityPoints);
    markers.push(...vMarkers);

    data.markers = markers;

    const priceSeries: MultiLinePair = {
      series: [],
      names: [],
    };

    const downRatioSeries: MultiLinePair = {
      series: [],
      names: [],
    };

    const vPointsSeries: MultiLinePair = {
      series: [],
      names: [],
    };

    // simple chart
    const volatilityPointsLeveledMarkers = convertVolatilityToLeveledMarkers(
      symbolParam,
      volatilityPoints,
    );

    vPointsSeries.series.push(volatilityPointsLeveledMarkers);
    vPointsSeries.names.push(symbolParam);

    const priceNorms = getPriceNorms({ volatilityPoints });

    const priceNormSeries: LeveledMarkers[] = priceNorms.map((p) => ({
      time: Math.floor(p.t / 1000) as any,
      level: p.c,
      color: "#7b1fa2",
      text: `PriceNorm ${(p.c * 100).toFixed(0)}%`,
    }));

    const downRatioWindowMs = windowsMs["1m"] / 2;
    const downRatioLeveledMarkers: LeveledMarkers[] = priceNorms.map((item) => {
      const cutOff = item.t - downRatioWindowMs;
      const recentPriceNorms = priceNorms.filter(
        (entry) => entry.t > cutOff && entry.t <= item.t,
      );
      const downRatio = getSharpDownRatio(recentPriceNorms);

      return {
        time: Math.floor(item.t / 1000) as any,
        level: downRatio,
        color: "#ef6c00",
        text: `DownRatio ${(downRatio * 100).toFixed(0)}%`,
      };
    });

    priceSeries.series.push(priceNormSeries);
    priceSeries.names.push(symbolParam);

    downRatioSeries.series.push(downRatioLeveledMarkers);
    downRatioSeries.names.push(symbolParam);

    data.priceSeries = priceSeries;
    data.downRatioSeries = downRatioSeries;
    data.vPointsSeries = vPointsSeries;
  }

  if (pickBooleanParam(tradeHistory)) {
    const slowStorage = await slowTrading.storage.data.load({
      includeHistory: true,
    });
    const activeMode = slowTrading.storage.mode.getActive(slowStorage);
    const tradeRows = [
      ...slowTrading.storage.history.getClosed(slowStorage, activeMode),
      ...slowTrading.storage.history.getOpen(slowStorage, activeMode),
    ];
    const firstKlineTime = Number(klines[0]?.[0]) / 1000;
    const lastKlineTime = Number(klines.at(-1)?.[0]) / 1000;
    const tradeMarkers = buildTradeMarkersFromHistory(tradeRows, symbolParam);
    const visibleTradeMarkers =
      Number.isFinite(firstKlineTime) && Number.isFinite(lastKlineTime)
        ? tradeMarkers.filter(
            (marker) =>
              Number(marker.time) >= firstKlineTime &&
              Number(marker.time) <= lastKlineTime,
          )
        : tradeMarkers;

    data.markers.push(...visibleTradeMarkers);
  }

  res.json(data);
}
