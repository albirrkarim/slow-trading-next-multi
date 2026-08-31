import type {
  DerivativesPositioningHistoryParams,
  DerivativesPositioningPoint,
} from "./types";

const BINANCE_FUTURES_REST_URL = "https://fapi.binance.com";
const REQUEST_TIMEOUT_MS = 10_000;

type BinanceOpenInterestPoint = {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
};

function makeBinanceSymbol(symbol: string): string {
  const compact = symbol.toUpperCase().replace(/[_\-/]/g, "");
  return compact.endsWith("USDT") ? compact : `${compact}USDT`;
}

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Binance market-data request failed (${response.status})`);
  }

  return response.json();
}

/**
 * Fetches bounded Binance futures candles and open interest, then aligns both
 * datasets by their exchange bucket timestamp.
 */
export async function getBinancePositioningHistory({
  interval,
  limit,
  symbol,
}: DerivativesPositioningHistoryParams): Promise<DerivativesPositioningPoint[]> {
  const binanceSymbol = makeBinanceSymbol(symbol);
  const safeLimit = Math.min(500, Math.max(2, Math.floor(limit)));
  const klinesUrl = new URL("/fapi/v1/klines", BINANCE_FUTURES_REST_URL);
  klinesUrl.searchParams.set("symbol", binanceSymbol);
  klinesUrl.searchParams.set("interval", interval);
  klinesUrl.searchParams.set("limit", String(safeLimit));

  const openInterestUrl = new URL(
    "/futures/data/openInterestHist",
    BINANCE_FUTURES_REST_URL,
  );
  openInterestUrl.searchParams.set("symbol", binanceSymbol);
  openInterestUrl.searchParams.set("period", interval);
  openInterestUrl.searchParams.set("limit", String(safeLimit));

  const [rawKlines, rawOpenInterest] = await Promise.all([
    getJson(klinesUrl),
    getJson(openInterestUrl),
  ]);

  if (!Array.isArray(rawKlines) || !Array.isArray(rawOpenInterest)) {
    throw new Error(`Binance does not have positioning history for ${binanceSymbol}`);
  }

  const openInterestByTime = new Map<
    number,
    { oiUnits: number; oiUsd: number }
  >();
  for (const item of rawOpenInterest as BinanceOpenInterestPoint[]) {
    const t = Number(item.timestamp);
    const oiUnits = Number(item.sumOpenInterest);
    const oiUsd = Number(item.sumOpenInterestValue);
    if (
      Number.isFinite(t) &&
      Number.isFinite(oiUnits) &&
      Number.isFinite(oiUsd) &&
      oiUnits >= 0 &&
      oiUsd >= 0
    ) {
      openInterestByTime.set(t, { oiUnits, oiUsd });
    }
  }

  return rawKlines
    .map((item): DerivativesPositioningPoint | null => {
      if (!Array.isArray(item)) return null;

      const t = Number(item[0]);
      const openInterest = openInterestByTime.get(t);
      const point = {
        t,
        o: Number(item[1]),
        h: Number(item[2]),
        l: Number(item[3]),
        c: Number(item[4]),
        v: Number(item[7]),
        oiUnits: Number(openInterest?.oiUnits),
        oiUsd: Number(openInterest?.oiUsd),
      };

      return Object.values(point).every(Number.isFinite) &&
        point.oiUnits >= 0 &&
        point.oiUsd >= 0
        ? point
        : null;
    })
    .filter((point): point is DerivativesPositioningPoint => point !== null)
    .sort((a, b) => a.t - b.t);
}
