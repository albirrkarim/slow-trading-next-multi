export interface CoinResultFilters {
  avgBottomToTopMaxHours: string;
  avgTopToBottomMaxHours: string;
  entrySequenceCountMinimum: string;
  entrySignalsPerMonthMinimum: string;
  firstSeenMinimumMonths: string;
  healthScoreMinimum: string;
  holdDurationAvgMaxHours: string;
  holdDurationMaxMaxHours: string;
  holdDurationMinMaxHours: string;
  maxBottom: string;
  maxBottomToTopMaxHours: string;
  maxLevelAbsolute: string;
  maxTop: string;
  maxTopToBottomMaxHours: string;
  vPointsPerMonthMinimum: string;
  vPointTransitionAvgHours: string;
  vPointTransitionMaxHours: string;
}

export interface CoinFilterConfig {
  filters: CoinResultFilters;
  requiredTags: string[];
}

export type PrunedCoinFilterConfig = Partial<CoinResultFilters> & {
  requiredTags?: string[];
};

export const EMPTY_COIN_RESULT_FILTERS: CoinResultFilters = {
  avgBottomToTopMaxHours: "",
  avgTopToBottomMaxHours: "",
  entrySequenceCountMinimum: "",
  entrySignalsPerMonthMinimum: "",
  firstSeenMinimumMonths: "",
  healthScoreMinimum: "",
  holdDurationAvgMaxHours: "",
  holdDurationMaxMaxHours: "",
  holdDurationMinMaxHours: "",
  maxBottom: "",
  maxBottomToTopMaxHours: "",
  maxLevelAbsolute: "",
  maxTop: "",
  maxTopToBottomMaxHours: "",
  vPointsPerMonthMinimum: "",
  vPointTransitionAvgHours: "",
  vPointTransitionMaxHours: "",
};

export const EMPTY_COIN_FILTER_CONFIG: CoinFilterConfig = {
  filters: { ...EMPTY_COIN_RESULT_FILTERS },
  requiredTags: [],
};

export const COIN_RESULT_FILTER_KEYS = Object.keys(
  EMPTY_COIN_RESULT_FILTERS,
) as Array<keyof CoinResultFilters>;

const MINIMUM_FILTER_KEYS = new Set<keyof CoinResultFilters>([
  "entrySequenceCountMinimum",
  "entrySignalsPerMonthMinimum",
  "firstSeenMinimumMonths",
  "healthScoreMinimum",
  "vPointsPerMonthMinimum",
]);

function normalizeRequiredTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const uniqueTags = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, 64);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (!uniqueTags.has(key)) uniqueTags.set(key, tag);
  }
  return [...uniqueTags.values()];
}

/** Keeps only known filter keys and string values from persisted data. */
export function normalizeCoinResultFilters(value: unknown): CoinResultFilters {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    COIN_RESULT_FILTER_KEYS.map((key) => [
      key,
      typeof source[key] === "string" ? source[key].trim().slice(0, 32) : "",
    ]),
  ) as unknown as CoinResultFilters;
}

/** Parses the JSON object used by tag.filters and the Good Coin Finder UI. */
export function normalizeCoinFilterConfig(value: unknown): CoinFilterConfig {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const hasNestedFilters = Object.hasOwn(source, "filters");

  return {
    filters: normalizeCoinResultFilters(
      hasNestedFilters ? source.filters : source,
    ),
    requiredTags: normalizeRequiredTags(source.requiredTags),
  };
}

function parseNumericFilter(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeFilterValue({
  current,
  incoming,
  key,
}: {
  current: string;
  incoming: string;
  key: keyof CoinResultFilters;
}) {
  const currentNumber = parseNumericFilter(current);
  const incomingNumber = parseNumericFilter(incoming);
  if (incomingNumber === null) return current;
  if (currentNumber === null) return incoming;

  const selected = MINIMUM_FILTER_KEYS.has(key)
    ? Math.max(currentNumber, incomingNumber)
    : Math.min(currentNumber, incomingNumber);
  return String(selected);
}

/** Combines filter configs with AND-style stricter numeric limits and tag union. */
export function mergeCoinFilterConfigs(
  base: CoinFilterConfig,
  configs: CoinFilterConfig[],
): CoinFilterConfig {
  const filters = { ...base.filters };
  const tags = new Map(
    base.requiredTags.map((tag) => [tag.toLocaleLowerCase(), tag]),
  );

  for (const config of configs) {
    for (const key of COIN_RESULT_FILTER_KEYS) {
      filters[key] = mergeFilterValue({
        current: filters[key],
        incoming: config.filters[key],
        key,
      });
    }
    for (const tag of config.requiredTags) {
      const key = tag.toLocaleLowerCase();
      if (!tags.has(key)) tags.set(key, tag);
    }
  }

  return { filters, requiredTags: [...tags.values()] };
}

export function hasActiveCoinFilterConfig(
  config: CoinFilterConfig | null,
): config is CoinFilterConfig {
  return Boolean(
    config &&
      (config.requiredTags.length > 0 ||
        COIN_RESULT_FILTER_KEYS.some((key) => config.filters[key] !== "")),
  );
}

/** Removes default empty values for readable copy/paste and compact storage. */
export function pruneCoinFilterConfig(
  config: CoinFilterConfig,
): PrunedCoinFilterConfig {
  const pruned = Object.fromEntries(
    COIN_RESULT_FILTER_KEYS.flatMap((key) =>
      config.filters[key] === "" ? [] : [[key, config.filters[key]]],
    ),
  ) as PrunedCoinFilterConfig;

  if (config.requiredTags.length > 0) {
    pruned.requiredTags = [...config.requiredTags];
  }

  return pruned;
}
