import type { CoinFinderRange } from "@/lib/devBacktest/coins/types";
import {
  EMPTY_COIN_FILTER_CONFIG,
  EMPTY_COIN_RESULT_FILTERS,
  normalizeCoinFilterConfig,
  type CoinResultFilters,
  type CoinFilterConfig,
} from "@/lib/devBacktest/coins/filter-config";

const STORAGE_KEY = "slow-trading:dev-coins:preferences:v1";
const VALID_RANGES = new Set<CoinFinderRange>([
  "6month",
  "1year",
  "2year",
  "3year",
  "4year",
  "5year",
]);

export interface CoinFinderPreferences {
  combinationSize: number;
  filterConfig: CoinFilterConfig;
  filterPresetTags: string[];
  range: CoinFinderRange;
  symbolsInput: string;
  threshold: [number, number];
  useCachedVPoints: boolean;
}

const defaults: CoinFinderPreferences = {
  combinationSize: 5,
  filterConfig: {
    filters: { ...EMPTY_COIN_FILTER_CONFIG.filters },
    requiredTags: [],
  },
  filterPresetTags: [],
  range: "6month",
  symbolsInput: "",
  threshold: [3, 5],
  useCachedVPoints: true,
};

function cloneDefaults(): CoinFinderPreferences {
  return {
    ...defaults,
    filterConfig: {
      filters: { ...defaults.filterConfig.filters },
      requiredTags: [...defaults.filterConfig.requiredTags],
    },
    filterPresetTags: [...defaults.filterPresetTags],
    threshold: [...defaults.threshold],
  };
}

function parseFilters(value: unknown): CoinResultFilters {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    Object.keys(EMPTY_COIN_RESULT_FILTERS).map((key) => [
      key,
      typeof source[key] === "string" ? source[key] : "",
    ]),
  ) as unknown as CoinResultFilters;
}

function parseTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const tags = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (!tags.has(key)) tags.set(key, tag);
  }
  return [...tags.values()];
}

/** Parses persisted coin-finder controls while rejecting malformed fields. */
function parse(raw: string | null): CoinFinderPreferences {
  if (!raw) {
    return cloneDefaults();
  }

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const range = VALID_RANGES.has(value.range as CoinFinderRange)
      ? (value.range as CoinFinderRange)
      : defaults.range;
    const combinationSize = Number(value.combinationSize);
    const threshold = Array.isArray(value.threshold)
      ? value.threshold.map(Number)
      : [];

    return {
      combinationSize: Number.isFinite(combinationSize)
        ? Math.max(0, Math.floor(combinationSize))
        : defaults.combinationSize,
      filterConfig: Object.hasOwn(value, "filterConfig")
        ? normalizeCoinFilterConfig(value.filterConfig)
        : {
            filters: parseFilters(value.candidateFilters),
            requiredTags: parseTags(value.requiredTags),
          },
      filterPresetTags: parseTags(value.filterPresetTags),
      range,
      symbolsInput:
        typeof value.symbolsInput === "string"
          ? value.symbolsInput
          : defaults.symbolsInput,
      threshold:
        threshold.length === 2 &&
        threshold.every((item) => Number.isFinite(item) && item >= 1) &&
        threshold[0] < threshold[1]
          ? [Math.floor(threshold[0]), Math.floor(threshold[1])]
          : [...defaults.threshold],
      useCachedVPoints:
        typeof value.useCachedVPoints === "boolean"
          ? value.useCachedVPoints
          : defaults.useCachedVPoints,
    };
  } catch {
    return cloneDefaults();
  }
}

function read() {
  if (typeof window === "undefined") return parse(null);
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parse(null);
  }
}

function write(preferences: CoinFinderPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

const coinFinderPreferences = { defaults, parse, read, write };

export default coinFinderPreferences;
