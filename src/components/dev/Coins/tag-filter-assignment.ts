import {
  COIN_RESULT_FILTER_KEYS,
  hasActiveCoinFilterConfig,
  type CoinFilterConfig,
  type CoinResultFilters,
} from "@/lib/devBacktest/coins/filter-config";
import type { CoinTag } from "@/lib/devBacktest/coins/tag-types";
import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";
import { filterCoinResults } from "./result";

const MINIMUM_FILTER_KEYS = new Set<keyof CoinResultFilters>([
  "entrySequenceCountMinimum",
  "entrySignalsPerMonthMinimum",
  "firstSeenMinimumMonths",
  "healthScoreMinimum",
  "vPointsPerMonthMinimum",
]);

interface NumberedTagFamily {
  key: string;
  number: number;
}

interface TagFilterCandidate {
  config: CoinFilterConfig;
  family: NumberedTagFamily | null;
  tag: CoinTag;
  tagKey: string;
}

function normalizeTagKey(tag: string) {
  return tag.toLocaleLowerCase();
}

function getNumberedTagFamily(tagName: string): NumberedTagFamily | null {
  const numberMatch = tagName.match(/\d+/);
  if (!numberMatch || !/[a-z]/i.test(tagName)) return null;

  const name = tagName.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;

  return {
    key: name.toLocaleLowerCase(),
    number: Number(numberMatch[0]),
  };
}

function parseFilter(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareFilterStrictness({
  key,
  left,
  right,
}: {
  key: keyof CoinResultFilters;
  left: string;
  right: string;
}) {
  const leftValue = parseFilter(left);
  const rightValue = parseFilter(right);
  if (leftValue === null && rightValue === null) return 0;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue === rightValue) return 0;

  return MINIMUM_FILTER_KEYS.has(key)
    ? rightValue! - leftValue!
    : leftValue! - rightValue!;
}

function countActiveFilters(config: CoinFilterConfig) {
  return COIN_RESULT_FILTER_KEYS.reduce(
    (count, key) => count + (config.filters[key] === "" ? 0 : 1),
    config.requiredTags.length,
  );
}

function compareTagFilterCandidates(
  left: TagFilterCandidate,
  right: TagFilterCandidate,
) {
  let leftWins = 0;
  let rightWins = 0;

  for (const key of COIN_RESULT_FILTER_KEYS) {
    const comparison = compareFilterStrictness({
      key,
      left: left.config.filters[key],
      right: right.config.filters[key],
    });
    if (comparison < 0) leftWins += 1;
    if (comparison > 0) rightWins += 1;
  }

  if (leftWins > 0 && rightWins === 0) return -1;
  if (rightWins > 0 && leftWins === 0) return 1;

  const byActiveFilterCount =
    countActiveFilters(right.config) - countActiveFilters(left.config);
  if (byActiveFilterCount !== 0) return byActiveFilterCount;

  const byNumber = (left.family?.number ?? 0) - (right.family?.number ?? 0);
  return byNumber === 0 ? left.tag.text.localeCompare(right.tag.text) : byNumber;
}

function setSymbolTag({
  add,
  coinTags,
  symbol,
  tag,
}: {
  add: boolean;
  coinTags: Record<string, string[]>;
  symbol: string;
  tag: string;
}) {
  const current = coinTags[symbol] ?? [];
  const currentKeys = new Set(current.map(normalizeTagKey));
  const tagKey = normalizeTagKey(tag);

  if (add) {
    if (!currentKeys.has(tagKey)) coinTags[symbol] = [...current, tag];
    return;
  }

  if (currentKeys.has(tagKey)) {
    coinTags[symbol] = current.filter((item) => normalizeTagKey(item) !== tagKey);
  }
}

function resultMatchesConfig({
  currentTagKeys,
  result,
  tag,
}: {
  currentTagKeys: Set<string>;
  result: CoinFinderResult;
  tag: TagFilterCandidate;
}) {
  if (
    filterCoinResults({
      filters: tag.config.filters,
      results: [result],
    }).length === 0
  ) {
    return false;
  }

  return tag.config.requiredTags.every((requiredTag) =>
    currentTagKeys.has(normalizeTagKey(requiredTag)),
  );
}

function applyExclusiveNumberedFamilies({
  candidates,
  tagKeys,
}: {
  candidates: TagFilterCandidate[];
  tagKeys: Set<string>;
}) {
  const familyCandidates = new Map<string, TagFilterCandidate[]>();

  for (const candidate of candidates) {
    if (!candidate.family || !tagKeys.has(candidate.tagKey)) continue;
    const matches = familyCandidates.get(candidate.family.key) ?? [];
    matches.push(candidate);
    familyCandidates.set(candidate.family.key, matches);
  }

  for (const matches of familyCandidates.values()) {
    if (matches.length < 2) continue;

    const selected = [...matches].sort(compareTagFilterCandidates)[0];
    for (const match of matches) {
      if (match.tagKey !== selected.tagKey) tagKeys.delete(match.tagKey);
    }
  }
}

function buildResultTagKeys({
  candidates,
  result,
  tagKeys,
}: {
  candidates: TagFilterCandidate[];
  result: CoinFinderResult;
  tagKeys: Set<string>;
}) {
  let nextTagKeys = new Set(tagKeys);

  for (let attempts = 0; attempts <= candidates.length; attempts += 1) {
    const previousKey = [...nextTagKeys].sort().join("\u0000");
    const candidateTagKeys = new Set(nextTagKeys);

    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of candidates) {
        if (candidateTagKeys.has(candidate.tagKey)) continue;
        if (!resultMatchesConfig({
          currentTagKeys: candidateTagKeys,
          result,
          tag: candidate,
        })) {
          continue;
        }

        candidateTagKeys.add(candidate.tagKey);
        changed = true;
      }
    }

    applyExclusiveNumberedFamilies({
      candidates,
      tagKeys: candidateTagKeys,
    });

    const nextKey = [...candidateTagKeys].sort().join("\u0000");
    nextTagKeys = candidateTagKeys;
    if (nextKey === previousKey) break;
  }

  return nextTagKeys;
}

export interface CoinTagFilterAssignment {
  changed: boolean;
  coinTags: Record<string, string[]>;
}

/** Applies tag.filters configs to the current run's result symbols. */
export function buildCoinTagFilterAssignment({
  coinTags,
  results,
  tags,
}: {
  coinTags: Record<string, string[]>;
  results: CoinFinderResult[];
  tags: CoinTag[];
}): CoinTagFilterAssignment {
  const nextCoinTags = Object.fromEntries(
    Object.entries(coinTags).map(([symbol, assignedTags]) => [
      symbol,
      [...assignedTags],
    ]),
  );
  const candidates: TagFilterCandidate[] = [];
  let changed = false;

  for (const tag of tags) {
    const config: CoinFilterConfig | null = tag.filters ?? null;
    if (!hasActiveCoinFilterConfig(config)) continue;

    candidates.push({
      config,
      family: getNumberedTagFamily(tag.text),
      tag,
      tagKey: normalizeTagKey(tag.text),
    });
  }

  const managedTagKeys = new Set(candidates.map((candidate) => candidate.tagKey));

  for (const result of results) {
    const symbol = result.symbol;
    const currentTags = nextCoinTags[symbol] ?? [];
    const baseTagKeys = new Set(
      currentTags
        .map(normalizeTagKey)
        .filter((tagKey) => !managedTagKeys.has(tagKey)),
    );
    const selectedTagKeys = buildResultTagKeys({
      candidates,
      result,
      tagKeys: baseTagKeys,
    });

    for (const candidate of candidates) {
      const before = nextCoinTags[symbol]?.join("\u0000") ?? "";
      setSymbolTag({
        add: selectedTagKeys.has(candidate.tagKey),
        coinTags: nextCoinTags,
        symbol,
        tag: candidate.tag.text,
      });
      const after = nextCoinTags[symbol]?.join("\u0000") ?? "";
      if (before !== after) changed = true;
    }
  }

  return { changed, coinTags: nextCoinTags };
}
