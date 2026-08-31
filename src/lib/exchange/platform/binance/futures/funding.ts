import type { UnifiedFundingRate } from "@/lib/exchange/types";
import { requestPublic } from "../utils";

const FUTURES_BASE_URL = "https://fapi.binance.com";

interface BinancePremiumIndexFunding {
  symbol?: unknown;
  lastFundingRate?: unknown;
  nextFundingTime?: unknown;
  time?: unknown;
}

/** Normalizes Binance premium-index responses into valid unified rates. */
export function normalizeBinanceFundingRates(
  values: BinancePremiumIndexFunding | BinancePremiumIndexFunding[],
  requestedSymbols?: Iterable<string>,
): UnifiedFundingRate[] {
  const requested = requestedSymbols
    ? new Set(
        Array.from(requestedSymbols, (symbol) =>
          String(symbol || "")
            .replace(/_/g, "")
            .trim()
            .toUpperCase(),
        ).filter(Boolean),
      )
    : null;

  return (Array.isArray(values) ? values : [values]).flatMap((value) => {
    const symbol = String(value.symbol || "")
      .trim()
      .toUpperCase();
    const rateText = String(value.lastFundingRate ?? "").trim();
    const rate = rateText ? Number(rateText) : Number.NaN;
    const t = Number(value.time);
    const nextFundingTime = Number(value.nextFundingTime);
    if (
      !symbol ||
      (requested && !requested.has(symbol)) ||
      !Number.isFinite(rate) ||
      !Number.isFinite(t) ||
      t <= 0
    ) {
      return [];
    }

    return [
      {
        symbol: symbol.endsWith("USDT")
          ? `${symbol.slice(0, -4)}_USDT`
          : symbol,
        rate,
        t,
        ...(Number.isFinite(nextFundingTime) && nextFundingTime > 0
          ? { nextFundingTime }
          : {}),
      },
    ];
  });
}

/** Fetches the latest Binance USD-M perpetual funding snapshot. */
async function getLatest(symbols?: string[]): Promise<UnifiedFundingRate[]> {
  const response = await requestPublic<
    BinancePremiumIndexFunding | BinancePremiumIndexFunding[]
  >("/fapi/v1/premiumIndex", {}, FUTURES_BASE_URL);

  return normalizeBinanceFundingRates(response, symbols);
}

const binanceFuturesFunding = {
  latest: {
    get: getLatest,
  },
  normalize: normalizeBinanceFundingRates,
} as const;

export default binanceFuturesFunding;
