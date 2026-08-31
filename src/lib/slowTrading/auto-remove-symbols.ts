import type { VolatilityPoint } from "@/lib/dynamic";

function normalizeSymbol(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function latestVolatilityPointLevel(
  modelMemory: any,
): number {
  const latestPoint = (
    modelMemory?.volatility?.lastVolatility ?? []
  ).at(-1) as VolatilityPoint | undefined;
  const level = Number(latestPoint?.lvl ?? 0);

  return Number.isFinite(level) ? level : 0;
}

/**
 * Finds configured symbols whose latest vpoint reached the configured absolute level.
 */
export function findAutoRemovableSymbols(params: {
  configuredSymbols: string[];
  thresholdAbsLevel: number;
  modelMemoryMap: Record<string, any>;
}): string[] {
  const thresholdAbsLevel = Math.floor(Number(params.thresholdAbsLevel));
  if (!Number.isFinite(thresholdAbsLevel) || thresholdAbsLevel <= 0) {
    return [];
  }

  return params.configuredSymbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter(
      (symbol) =>
        Math.abs(latestVolatilityPointLevel(params.modelMemoryMap[symbol])) >=
        thresholdAbsLevel,
    );
}

/**
 * Returns whether a valid market price is strictly below the enabled minimum.
 */
export function isPriceBelowAutoRemoveMinimum(params: {
  price: unknown;
  minimumPrice: unknown;
}): boolean {
  const price = Number(params.price);
  const minimumPrice = Number(params.minimumPrice);

  return (
    Number.isFinite(price) &&
    price > 0 &&
    Number.isFinite(minimumPrice) &&
    minimumPrice > 0 &&
    price < minimumPrice
  );
}

/**
 * Finds configured symbols whose latest valid market price is below the minimum.
 */
export function findAutoRemovableSymbolsByMinPrice(params: {
  configuredSymbols: string[];
  latestPriceBySymbol: Record<string, number>;
  minimumPrice: number;
}): string[] {
  return params.configuredSymbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter((symbol) =>
      isPriceBelowAutoRemoveMinimum({
        price: params.latestPriceBySymbol[symbol],
        minimumPrice: params.minimumPrice,
      }),
    );
}

/** Finds configured symbols below the enabled minimum USD market cap. */
export function findAutoRemovableSymbolsByMarketCap(params: {
  configuredSymbols: string[];
  marketCapUSDBySymbol: Record<string, number>;
  minimumMarketCapUSD: number;
}): string[] {
  const minimumMarketCapUSD = Number(params.minimumMarketCapUSD);
  if (!Number.isFinite(minimumMarketCapUSD) || minimumMarketCapUSD <= 0) {
    return [];
  }

  return params.configuredSymbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter((symbol) => {
      const marketCapUSD = Number(params.marketCapUSDBySymbol[symbol]);
      return (
        Number.isFinite(marketCapUSD) &&
        marketCapUSD > 0 &&
        marketCapUSD < minimumMarketCapUSD
      );
    });
}

/** Returns the stored vPoint with the greatest valid movement percentage. */
export function findHighestVPointPct(
  points: VolatilityPoint[],
): VolatilityPoint | undefined {
  return points.reduce<VolatilityPoint | undefined>((highest, point) => {
    const pct = Number(point.pct);
    if (!Number.isFinite(pct)) {
      return highest;
    }
    if (!highest || pct > Number(highest.pct)) {
      return point;
    }
    return highest;
  }, undefined);
}

/** Finds symbols when any vPoint in their complete stored history meets the threshold. */
export function findAutoRemovableSymbolsByVPointPct(params: {
  configuredSymbols: string[];
  minimumVPointPct: number;
  volatilityPointsBySymbol: Record<string, VolatilityPoint[]>;
}): string[] {
  const minimumVPointPct = Number(params.minimumVPointPct);
  if (!Number.isFinite(minimumVPointPct) || minimumVPointPct <= 0) {
    return [];
  }

  return params.configuredSymbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter((symbol) => {
      const highest = findHighestVPointPct(
        params.volatilityPointsBySymbol[symbol] ?? [],
      );
      return Boolean(highest && highest.pct >= minimumVPointPct);
    });
}

/**
 * Removes symbols from a configured list while preserving the original order.
 */
export function removeSymbolsFromConfig(
  configuredSymbols: string[],
  symbolsToRemove: string[],
): string[] {
  const removeSet = new Set(symbolsToRemove.map(normalizeSymbol));

  return configuredSymbols
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((symbol) => !removeSet.has(symbol));
}

const slowTradingAutoRemoveSymbols = {
  find: {
    byAbsLevel: findAutoRemovableSymbols,
    byMarketCap: findAutoRemovableSymbolsByMarketCap,
    byMinPrice: findAutoRemovableSymbolsByMinPrice,
    byVPointPct: findAutoRemovableSymbolsByVPointPct,
  },
  price: {
    isBelowMinimum: isPriceBelowAutoRemoveMinimum,
  },
  vPoint: {
    findHighestPct: findHighestVPointPct,
  },
  remove: {
    fromConfig: removeSymbolsFromConfig,
  },
} as const;

export default slowTradingAutoRemoveSymbols;
export { slowTradingAutoRemoveSymbols };
