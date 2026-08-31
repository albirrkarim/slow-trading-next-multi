"use client";

import CoinTagSelect from "@/components/dev/Coins/CoinTagSelect";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { UnifiedFundingRate } from "@/lib/exchange";
import slowTradingClient, {
  type SlowEntrySequenceCount,
} from "@/lib/slowTrading/client";
import ClearIcon from "@mui/icons-material/Clear";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import LatestVolatilityPointRow from "./LatestVolatilityPointRow";
import entrySequenceCandidates from "../entry-sequence-candidates";
import CoinTagComposition from "./CoinTagComposition";
import type {
  LatestVolatilityPointsProps,
  VolatilityPointLabelFrequency,
} from "./types";
import { estimateMaxEntryFromVolume24h } from "./volume";
import VolatilityPointLabelFrequencyBar from "./VolatilityPointLabelFrequencyBar";
import HeaderMetrics from "@/components/ui/HeaderMetrics";

export {
  buildConfiguredCoinTagComposition,
  buildConfiguredCoinTagCompositionGroups,
} from "./CoinTagComposition";
export { simplifyId } from "./utils";
export { formatMarketCapUpdatedAt } from "./LatestVolatilityPointRow";
export {
  describeFundingRatePayer,
  formatFundingRatePct,
  formatFundingRateUpdatedAt,
} from "./FundingRateCell";
export {
  buildMaxEntryVolumeTooltip,
  estimateMaxEntryFromVolume24h,
  formatVolume24h,
  getEstimatedMaxEntryRiskColor,
  getVolume24hRiskColor,
  isLowVolume24h,
  isVeryLowVolume24h,
} from "./volume";
export type {
  LatestVolatilityPointsProps,
  VolatilityPointLabelFrequency,
} from "./types";

type SortDirection = "asc" | "desc";
type SortKey =
  | "symbol"
  | "price"
  | "marketCap"
  | "fundingRate"
  | "entrySequence"
  | "frequency"
  | "metadata"
  | "volume"
  | "level"
  | "time";

interface LatestVolatilityPointTableRow {
  descriptionText: string;
  entrySequenceCount: SlowEntrySequenceCount;
  estimatedMaxEntry: number | undefined;
  fundingRate: UnifiedFundingRate | undefined;
  index: number;
  levelFrequency: Record<string, number>;
  labelFrequency: VolatilityPointLabelFrequency;
  marketCapFetchedAt: number | undefined;
  marketCapUSD: number | undefined;
  point: VolatilityPoint;
  pointCount: number;
  symbol: string;
  volume24h: number | undefined;
}

interface LatestVolatilityPointColumn {
  help: {
    meaning: string | ((minActionableAbsoluteLevel: number) => string);
    source: string;
  };
  key: SortKey;
  label: string;
  width?: string;
}

const COLUMNS: LatestVolatilityPointColumn[] = [
  {
    help: {
      meaning:
        "The coin symbol currently included in this SLOW configuration. Removing it prevents new entries but does not stop management of an open position.",
      source: "Coin Management → Symbols and locally stored coin metadata.",
    },
    key: "symbol",
    label: "Symbol",
    width: "500px",
  },
  {
    help: {
      meaning:
        "Price recorded on the coin's latest volatility point in the loaded dashboard range. It is not a continuously streaming quote.",
      source: "The latest loaded volatility-point record generated from exchange kline data.",
    },
    key: "price",
    label: "Latest price",
  },
  {
    help: {
      meaning:
        "Circulating market capitalization in USD. A larger market cap does not necessarily guarantee deeper order-book liquidity.",
      source:
        "CoinMarketCap, stored in the persistent per-symbol cache for up to 24 hours. The row shows when the cached value was fetched.",
    },
    key: "marketCap",
    label: "Market cap",
  },
  {
    help: {
      meaning:
        "Think of it as which side is more crowded. A positive rate often means the market is crowded LONG, so LONG pays SHORT. A negative rate often means the market is crowded SHORT, so SHORT pays LONG. It does not measure the number of traders. The rate is for one funding interval and applies only if the position is open at settlement.",
      source:
        "Binance USD-M public premium-index snapshot. The row shows Binance's snapshot time.",
    },
    key: "fundingRate",
    label: "Funding rate",
  },
  {
    help: {
      meaning: (minActionableAbsoluteLevel) =>
        `Number of historical entry-sequence candidates in the loaded range with an absolute level of at least ${minActionableAbsoluteLevel}. LONG and SHORT counts are shown separately.`,
      source:
        "Entry-sequence candidates calculated from the loaded volatility-point history and the configured minimum actionable absolute level.",
    },
    key: "entrySequence",
    label: "Count entry sequence",
  },
  {
    help: {
      meaning:
        "Total volatility-point count for the coin in the loaded range. T and B show TOP/BOTTOM shares; level[count] shows how often each level occurred.",
      source: "The loaded volatility-point history for this dashboard range.",
    },
    key: "frequency",
    label: "Frequency",
  },
  {
    help: {
      meaning:
        "Editable notes about the coin. This text is informational and is not used in strategy calculations.",
      source: "Locally stored coin metadata entered by the user.",
    },
    key: "metadata",
    label: "Description",
    width: "500px",
  },
  {
    help: {
      meaning:
        "The coin's 24-hour quote volume and a capacity estimate based on the configured maximum-entry percentage. The estimate is not guaranteed fill liquidity.",
      source:
        "The active exchange's 24-hour ticker data, combined with Max Entry Based on 24-Hour Volume % from the SLOW configuration.",
    },
    key: "volume",
    label: "24h volume & estimated max entry",
  },
  {
    help: {
      meaning:
        "The latest volatility-point level and its age. Positive levels are TOP points, negative levels are BOTTOM points, and a larger absolute value is a more extreme level.",
      source: "The latest loaded volatility-point record for the coin.",
    },
    key: "level",
    label: "Last level",
  },
  {
    help: {
      meaning:
        "Manual controls to open an entry, inspect the chart or JSON, and remove the coin from new-entry configuration.",
      source: "Dashboard actions backed by the SLOW runtime and configuration APIs.",
    },
    key: "time",
    label: "Action",
    width: "50px",
  },
];
const MISSING_VOLATILITY_SYMBOL_LIMIT = 16;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100] as const;
const STORAGE_KEY = "slow-trading:latest-volatility-points:controls:v1";
const SORT_KEYS = new Set<SortKey>(COLUMNS.map((column) => column.key));
const SORT_DIRECTIONS = new Set<SortDirection>(["asc", "desc"]);
const ROWS_PER_PAGE_VALUES = new Set<number>(ROWS_PER_PAGE_OPTIONS);
const SYMBOL_SEARCH_MAX_LENGTH = 1_000;

/** Resolves table-header explanations from the same definitions used by the UI. */
export function getLatestVolatilityPointColumnHelp(
  minActionableAbsoluteLevel: number,
) {
  return COLUMNS.map((column) => ({
    key: column.key,
    meaning:
      typeof column.help.meaning === "function"
        ? column.help.meaning(minActionableAbsoluteLevel)
        : column.help.meaning,
    source: column.help.source,
  }));
}

interface LatestVolatilityPointControls {
  rowsPerPage: number;
  selectedTags: string[];
  sortDirection: SortDirection;
  sortKey: SortKey;
  symbolSearch: string;
}

const DEFAULT_CONTROLS: LatestVolatilityPointControls = {
  rowsPerPage: 25,
  selectedTags: [],
  sortDirection: "asc",
  sortKey: "symbol",
  symbolSearch: "",
};

/** Normalizes the latest-table symbol search text for stable matching/storage. */
function normalizeSymbolSearch(value: unknown) {
  return typeof value === "string"
    ? value
      .trim()
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s+/g, " ")
      .slice(0, SYMBOL_SEARCH_MAX_LENGTH)
    : "";
}

/** Checks whether a symbol should remain visible for the current symbol search. */
export function matchesLatestVolatilitySymbolSearch({
  search,
  symbol,
}: {
  search: string;
  symbol: string;
}) {
  const normalizedSearch = normalizeSymbolSearch(search).toLocaleUpperCase();
  if (!normalizedSearch) return true;

  const normalizedSymbol = symbol.trim().toLocaleUpperCase();
  const searchTerms = normalizedSearch
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);

  if (searchTerms.length > 1 || normalizedSearch.includes(",")) {
    return searchTerms.includes(normalizedSymbol);
  }

  return normalizedSymbol.includes(normalizedSearch);
}

/** Parses saved table controls while ignoring malformed or obsolete fields. */
function parseControls(raw: string | null): LatestVolatilityPointControls {
  if (!raw) return DEFAULT_CONTROLS;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const sortKey = SORT_KEYS.has(value.sortKey as SortKey)
      ? (value.sortKey as SortKey)
      : DEFAULT_CONTROLS.sortKey;
    const sortDirection = SORT_DIRECTIONS.has(
      value.sortDirection as SortDirection,
    )
      ? (value.sortDirection as SortDirection)
      : DEFAULT_CONTROLS.sortDirection;
    const rowsPerPage = ROWS_PER_PAGE_VALUES.has(Number(value.rowsPerPage))
      ? Number(value.rowsPerPage)
      : DEFAULT_CONTROLS.rowsPerPage;
    const selectedTags = Array.isArray(value.selectedTags)
      ? Array.from(
        new Set(
          value.selectedTags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      )
      : DEFAULT_CONTROLS.selectedTags;
    const symbolSearch = normalizeSymbolSearch(value.symbolSearch);

    return { rowsPerPage, selectedTags, sortDirection, sortKey, symbolSearch };
  } catch {
    return DEFAULT_CONTROLS;
  }
}

function readControls() {
  if (typeof window === "undefined") return DEFAULT_CONTROLS;

  try {
    return parseControls(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_CONTROLS;
  }
}

function writeControls(controls: LatestVolatilityPointControls) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }
}

function compareNullableNumber(
  left: number | undefined,
  right: number | undefined,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

/** Finds configured symbols that have no loaded volatility points. */
export function getMissingVolatilitySymbols({
  configuredSymbols,
  volatilityMap,
}: {
  configuredSymbols: string[];
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  const symbolsWithVolatility = new Set(
    Object.entries(volatilityMap)
      .filter(([, points]) => points.length > 0)
      .map(([symbol]) => symbol.trim().toUpperCase()),
  );

  return configuredSymbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter((symbol) => !symbolsWithVolatility.has(symbol))
    .sort((left, right) => left.localeCompare(right));
}

function formatMissingVolatilitySymbols(symbols: string[]) {
  const visibleSymbols = symbols.slice(0, MISSING_VOLATILITY_SYMBOL_LIMIT);
  const hiddenCount = symbols.length - visibleSymbols.length;

  return [
    visibleSymbols.join(", "),
    hiddenCount > 0 ? `+${hiddenCount} more` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Counts vPoints by volatility level for the loaded dashboard range. */
export function countVolatilityLevels(points: VolatilityPoint[]) {
  return points.reduce<Record<string, number>>((frequency, point) => {
    if (!Number.isFinite(point.lvl)) return frequency;
    const key = String(point.lvl);
    frequency[key] = (frequency[key] ?? 0) + 1;
    return frequency;
  }, {});
}

/** Calculates TOP/DOWN vPoint share for the loaded dashboard range. */
export function countVolatilityPointLabels(
  points: VolatilityPoint[],
): VolatilityPointLabelFrequency {
  let downCount = 0;
  let topCount = 0;

  for (const point of points) {
    if (point.l === "T") topCount += 1;
    if (point.l === "B") downCount += 1;
  }

  const total = topCount + downCount;

  return {
    downCount,
    downPct: total > 0 ? (downCount / total) * 100 : 0,
    topCount,
    topPct: total > 0 ? (topCount / total) * 100 : 0,
  };
}

/** Counts TOP/DOWN vPoint share across configured coins in the dashboard range. */
export function countConfiguredVolatilityPointLabels({
  configuredSymbols,
  volatilityMap,
}: {
  configuredSymbols: Iterable<string>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  const configuredSymbolSet = new Set(
    Array.from(configuredSymbols, (symbol) => symbol.trim().toUpperCase()),
  );

  return countVolatilityPointLabels(
    Object.entries(volatilityMap).flatMap(([symbol, points]) =>
      configuredSymbolSet.has(symbol.trim().toUpperCase()) ? points : [],
    ),
  );
}

/** Sorts latest volatility rows by the clicked table header. */
export function compareLatestVolatilityPointRows(
  left: LatestVolatilityPointTableRow,
  right: LatestVolatilityPointTableRow,
  sortKey: SortKey,
) {
  if (sortKey === "symbol") return left.symbol.localeCompare(right.symbol);
  if (sortKey === "price") return left.point.p - right.point.p;
  if (sortKey === "marketCap") {
    return compareNullableNumber(left.marketCapUSD, right.marketCapUSD);
  }
  if (sortKey === "fundingRate") {
    return compareNullableNumber(left.fundingRate?.rate, right.fundingRate?.rate);
  }
  if (sortKey === "entrySequence") {
    return left.entrySequenceCount.total - right.entrySequenceCount.total;
  }
  if (sortKey === "frequency") return left.pointCount - right.pointCount;
  if (sortKey === "metadata") {
    return left.descriptionText.localeCompare(right.descriptionText);
  }
  if (sortKey === "volume") {
    const byVolume = compareNullableNumber(left.volume24h, right.volume24h);
    if (byVolume !== 0) return byVolume;
    return compareNullableNumber(
      left.estimatedMaxEntry,
      right.estimatedMaxEntry,
    );
  }
  if (sortKey === "level") {
    const leftLevel = left.point.lvl ?? 0;
    const rightLevel = right.point.lvl ?? 0;
    const byAbsoluteLevel = Math.abs(leftLevel) - Math.abs(rightLevel);
    if (byAbsoluteLevel !== 0) return byAbsoluteLevel;
    return leftLevel - rightLevel;
  }
  return (left.point.t ?? 0) - (right.point.t ?? 0);
}

/**
 * Display the latest volatility point for each configured symbol.
 * Created: 05 Dec 2025
 */
export default function LatestVolatilityPoints({
  availableTags,
  coinDescriptions,
  coinTags,
  volatilityMap,
  dashboardState,
  deletingSymbol,
  enteringSymbol,
  fundingRateBySymbol,
  marketCapFetchedAtBySymbol,
  marketCapUSDBySymbol,
  onDeleteCoin,
  onManualEntry,
  onCoinDescriptionChange,
  onCoinTagsChange,
  openSymbols = [],
  tagManagerAction,
  tagColors,
  tagDescriptions,
  volume24hBySymbol,
}: LatestVolatilityPointsProps) {
  const isMobile = useMediaQuery("(max-width:600px)");
  const [controls, setControls] =
    useState<LatestVolatilityPointControls>(readControls);
  const [symbolSearchDraft, setSymbolSearchDraft] = useState(
    controls.symbolSearch,
  );
  const [page, setPage] = useState(0);
  const { rowsPerPage, selectedTags, sortDirection, sortKey, symbolSearch } =
    controls;

  useEffect(() => {
    writeControls(controls);
  }, [controls]);

  useEffect(() => {
    const nextSearch = normalizeSymbolSearch(symbolSearchDraft);
    if (nextSearch === symbolSearch) return undefined;

    const timeoutId = window.setTimeout(() => {
      setPage(0);
      setControls((current) =>
        current.symbolSearch === nextSearch
          ? current
          : { ...current, symbolSearch: nextSearch },
      );
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [symbolSearch, symbolSearchDraft]);

  const normalizedOpenSymbols = useMemo(
    () => new Set(openSymbols.map((symbol) => symbol.trim().toUpperCase())),
    [openSymbols],
  );
  const configuredSymbols = useMemo(
    () =>
      new Set(
        dashboardState.config.symbols.map((symbol) =>
          symbol.trim().toUpperCase(),
        ),
      ),
    [dashboardState.config.symbols],
  );
  const missingVolatilitySymbols = useMemo(
    () =>
      getMissingVolatilitySymbols({
        configuredSymbols: dashboardState.config.symbols,
        volatilityMap,
      }),
    [dashboardState.config.symbols, volatilityMap],
  );
  const canDeleteAnotherCoin = configuredSymbols.size > 1;
  const selectedTagKeys = useMemo(
    () => selectedTags.map((tag) => tag.toLocaleLowerCase()),
    [selectedTags],
  );
  const configuredLabelFrequency = useMemo(
    () =>
      countConfiguredVolatilityPointLabels({
        configuredSymbols,
        volatilityMap,
      }),
    [configuredSymbols, volatilityMap],
  );
  const resolvedMinActionableAbsoluteLevel =
    entrySequenceCandidates.threshold.resolve(
      dashboardState.config.minActionableAbsoluteLevel,
    );
  const columnHelpByKey = useMemo(
    () =>
      new Map(
        getLatestVolatilityPointColumnHelp(
          resolvedMinActionableAbsoluteLevel,
        ).map((column) => [column.key, column]),
      ),
    [resolvedMinActionableAbsoluteLevel],
  );
  const displayableRows = useMemo(() => {
    const entrySequenceCounts = slowTradingClient.entrySequences.count({
      entrySignals: entrySequenceCandidates.build({
        minActionableAbsoluteLevel:
          dashboardState.config.minActionableAbsoluteLevel,
        volatilityMap,
      }),
      volatilityMap,
    });
    const maxEntryBased24HourVolPct =
      dashboardState.config.maxEntryBased24HourVolPct ?? 0.2;
    const entrySequenceCountBySymbol = new Map(
      entrySequenceCounts.map((item) => [item.symbol, item]),
    );

    return Object.entries(volatilityMap).flatMap(
      ([symbol, points], index): LatestVolatilityPointTableRow[] => {
        const latestPoint = points.at(-1);
        if (!latestPoint) return [];

        const normalizedSymbol = symbol.trim().toUpperCase();
        if (!configuredSymbols.has(normalizedSymbol)) return [];

        const volume24h = volume24hBySymbol[normalizedSymbol];
        const fundingRate = fundingRateBySymbol[normalizedSymbol];
        const marketCapFetchedAt =
          marketCapFetchedAtBySymbol[normalizedSymbol];
        const marketCapUSD = marketCapUSDBySymbol[normalizedSymbol];

        return [
          {
            descriptionText: coinDescriptions[normalizedSymbol] ?? "",
            entrySequenceCount: entrySequenceCountBySymbol.get(
              normalizedSymbol,
            ) ?? {
              long: 0,
              short: 0,
              symbol: normalizedSymbol,
              total: 0,
            },
            estimatedMaxEntry: estimateMaxEntryFromVolume24h({
              maxEntryBased24HourVolPct,
              volume24h,
            }),
            fundingRate,
            index,
            levelFrequency: countVolatilityLevels(points),
            labelFrequency: countVolatilityPointLabels(points),
            marketCapFetchedAt,
            marketCapUSD,
            point: latestPoint,
            pointCount: points.length,
            symbol: normalizedSymbol,
            volume24h,
          },
        ];
      },
    );
  }, [
    coinDescriptions,
    configuredSymbols,
    dashboardState.config.maxEntryBased24HourVolPct,
    dashboardState.config.minActionableAbsoluteLevel,
    fundingRateBySymbol,
    marketCapFetchedAtBySymbol,
    marketCapUSDBySymbol,
    volatilityMap,
    volume24hBySymbol,
  ]);

  const rows = useMemo(() => {
    const filteredRows = displayableRows.filter((row) => {
      if (
        !matchesLatestVolatilitySymbolSearch({
          search: symbolSearch,
          symbol: row.symbol,
        })
      ) {
        return false;
      }

      if (selectedTagKeys.length === 0) return true;
      const tagKeys = new Set(
        (coinTags[row.symbol] ?? []).map((tag) => tag.toLocaleLowerCase()),
      );
      return selectedTagKeys.every((tag) => tagKeys.has(tag));
    });

    return [...filteredRows].sort((left, right) => {
      const result = compareLatestVolatilityPointRows(left, right, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [
    coinTags,
    displayableRows,
    selectedTagKeys,
    sortDirection,
    sortKey,
    symbolSearch,
  ]);

  const countLabel =
    selectedTags.length > 0 || symbolSearch
      ? `${rows.length}/${displayableRows.length}`
      : rows.length.toLocaleString();
  const maxPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, maxPage);
  const paginatedRows = useMemo(() => {
    const start = currentPage * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [currentPage, rows, rowsPerPage]);

  const changeSort = (nextKey: SortKey) => {
    setPage(0);
    setControls((current) =>
      nextKey === current.sortKey
        ? {
          ...current,
          sortDirection: current.sortDirection === "asc" ? "desc" : "asc",
        }
        : { ...current, sortDirection: "asc", sortKey: nextKey },
    );
  };

  return (
    <HeaderMetrics
      defaultExpanded={!isMobile}
      headerCanBeClicked
      rememberExpand="latest-volatility-points"
      title={
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Latest Volatility Points ({countLabel})
        </Typography>
      }
    >
      {(expanded) =>
        expanded && (
          <Box>
            {tagManagerAction && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 1,
                  my: 1,
                }}
              >
                {tagManagerAction}

                <VolatilityPointLabelFrequencyBar
                  frequency={configuredLabelFrequency}
                  width={220}
                />
              </Box>
            )}

            <HeaderMetrics
              rememberExpand="latest-volatility-points:coin-tags-composition"
              headerCanBeClicked
              title="Coin tags composition"
              sx={{ my: 1 }}
            >
              {(expandedBelow) => (
                <>
                  {expandedBelow && (
                    <CoinTagComposition
                      coinTags={coinTags}
                      configuredSymbols={dashboardState.config.symbols}
                      tagColors={tagColors}
                      tagDescriptions={tagDescriptions}
                    />
                  )}
                </>
              )}
            </HeaderMetrics>

            <Box
              sx={{
                alignItems: "flex-end",
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(180px, 260px) 1fr",
                },
                mb: 1,
                maxWidth: 820,
              }}
            >
              <TextField
                fullWidth
                label="Search symbol"
                onChange={(event) => {
                  setSymbolSearchDraft(
                    event.target.value.slice(0, SYMBOL_SEARCH_MAX_LENGTH),
                  );
                }}
                placeholder="BTC or BTC, ETH, SOL"
                size="small"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: symbolSearchDraft ? (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="Clear symbol search"
                          edge="end"
                          onClick={() => {
                            setSymbolSearchDraft("");
                            setPage(0);
                            setControls((current) => ({
                              ...current,
                              symbolSearch: "",
                            }));
                          }}
                          size="small"
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : undefined,
                  },
                }}
                value={symbolSearchDraft}
                variant="standard"
              />

              <CoinTagSelect
                allowCreate={false}
                label="Filter by tags"
                onChange={(nextTags) => {
                  setPage(0);
                  setControls((current) => ({
                    ...current,
                    selectedTags: nextTags,
                  }));
                }}
                options={availableTags}
                tagColors={tagColors}
                tagDescriptions={tagDescriptions}
                value={selectedTags}
              />
            </Box>

            {missingVolatilitySymbols.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                {missingVolatilitySymbols.length} configured coin
                {missingVolatilitySymbols.length > 1 ? "s" : ""} have no
                volatility points and are hidden from this table:{" "}
                {formatMissingVolatilitySymbols(missingVolatilitySymbols)}
              </Alert>
            )}

            <Paper sx={{ mt: 1 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {COLUMNS.map((column) => {
                        const label =
                          column.key === "entrySequence"
                            ? `Entry sequences (abs >= ${resolvedMinActionableAbsoluteLevel})`
                            : column.label;
                        const help = columnHelpByKey.get(column.key);
                        const accessibleHelp = help
                          ? `${label}. Meaning: ${help.meaning} Source: ${help.source}`
                          : label;

                        return (
                          <TableCell key={column.key} width={column.width}>
                            <Tooltip
                              arrow
                              enterTouchDelay={0}
                              title={
                                help && (
                                  <Box sx={{ maxWidth: 360, py: 0.5 }}>
                                    <Typography
                                      component="p"
                                      sx={{ fontSize: "inherit", mb: 0.75 }}
                                    >
                                      <strong>Meaning:</strong> {help.meaning}
                                    </Typography>
                                    <Typography
                                      component="p"
                                      sx={{ fontSize: "inherit" }}
                                    >
                                      <strong>Source:</strong> {help.source}
                                    </Typography>
                                  </Box>
                                )
                              }
                            >
                              <TableSortLabel
                                active={sortKey === column.key}
                                aria-label={accessibleHelp}
                                direction={
                                  sortKey === column.key
                                    ? sortDirection
                                    : "asc"
                                }
                                onClick={() => changeSort(column.key)}
                              >
                                {label}
                                <HelpOutlineIcon
                                  aria-hidden
                                  sx={{
                                    color: "text.secondary",
                                    fontSize: 16,
                                    ml: 0.5,
                                  }}
                                />
                              </TableSortLabel>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRows.map((row) => (
                      <LatestVolatilityPointRow
                        availableTags={availableTags}
                        canDeleteAnotherCoin={canDeleteAnotherCoin}
                        coinDescriptions={coinDescriptions}
                        coinTags={coinTags}
                        dashboardState={dashboardState}
                        deletingSymbol={deletingSymbol}
                        entrySequenceCount={row.entrySequenceCount}
                        enteringSymbol={enteringSymbol}
                        fundingRate={row.fundingRate}
                        index={row.index}
                        key={row.symbol}
                        labelFrequency={row.labelFrequency}
                        levelFrequency={row.levelFrequency}
                        marketCapFetchedAt={row.marketCapFetchedAt}
                        marketCapUSD={row.marketCapUSD}
                        normalizedOpenSymbols={normalizedOpenSymbols}
                        onCoinDescriptionChange={onCoinDescriptionChange}
                        onCoinTagsChange={onCoinTagsChange}
                        onDeleteCoin={onDeleteCoin}
                        onManualEntry={onManualEntry}
                        point={row.point}
                        pointCount={row.pointCount}
                        symbol={row.symbol}
                        tagColors={tagColors}
                        tagDescriptions={tagDescriptions}
                        volume24h={row.volume24h}
                      />
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell align="center" colSpan={COLUMNS.length}>
                          No latest volatility points match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={rows.length}
                onPageChange={(_event, nextPage) => setPage(nextPage)}
                onRowsPerPageChange={(event) => {
                  setPage(0);
                  setControls((current) => ({
                    ...current,
                    rowsPerPage: Number.parseInt(event.target.value, 10),
                  }));
                }}
                page={currentPage}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[...ROWS_PER_PAGE_OPTIONS]}
              />
            </Paper>
          </Box>
        )
      }
    </HeaderMetrics>
  );
}
