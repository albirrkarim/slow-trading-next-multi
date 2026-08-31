"use client";

import type {
  CoinFinderResult,
  CoinFinderVolatilityMap,
} from "@/lib/devBacktest/coins/types";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import moment from "moment";
import CoinChartDialog from "./CoinChartDialog";
import CoinCorrelationScore from "./CoinCorrelationScore";
import CoinHealthScore from "./CoinHealthScore";
import CoinMetadataEditor from "./CoinMetadataEditor";
import CoinVPointPctDistribution from "./CoinVPointPctDistribution";
import VPointLevelFrequency from "@/components/ui/VPointLevelFrequency";
import {
  EMPTY_COIN_RESULT_FILTERS,
  filterAndSortCoinResults,
  isFirstSeenYoungerThanMonths,
  type CoinResultSortKey,
} from "./result";
import DisplayCoinSymbol from "@/components/LiveDashboard/Feature/DisplayCoin";

const COLUMNS: Array<{ key: CoinResultSortKey; label: string }> = [
  { key: "symbol", label: "Symbol" },
  { key: "firstSeen", label: "First seen" },
  { key: "marketCapUSD", label: "Market cap" },
  { key: "healthScore", label: "Health score (0–100)" },
  { key: "correlationScore", label: "Correlation score (0–1)" },
  { key: "entrySequenceCount", label: "Count entry sequence" },
  { key: "entrySignalsPerMonth", label: "Avg entry signals / month" },
  { key: "holdDurationMinMs", label: "Min hold" },
  { key: "holdDurationAvgMs", label: "Avg hold" },
  { key: "holdDurationMaxMs", label: "Max hold" },
  { key: "vPointsPerMonth", label: "Avg vPoints / month" },
  { key: "maxTop", label: "Max top" },
  { key: "maxBottom", label: "Max bottom" },
  { key: "maxLevelAbsolute", label: "Max level absolute" },
  { key: "pointCount", label: "Frequency" },
  {
    key: "vPointCloseDistanceOccurrences",
    label: "Occurrences vPoint distance below 20 min",
  },
  { key: "vPointPctMin", label: "Min vPoint pct" },
  { key: "vPointPctMax", label: "Max vPoint pct" },
  { key: "vPointPctAvg", label: "Avg vPoint pct" },
  {
    key: "vPointTransitionMinMs",
    label: "Min vPoint transition",
  },
  {
    key: "vPointTransitionAvgMs",
    label: "Avg vPoint transition",
  },
  {
    key: "vPointTransitionMaxMs",
    label: "Max vPoint transition",
  },
  {
    key: "avgBottomToTopMs",
    label: "Avg latest BOTTOM → TOP",
  },
  {
    key: "maxBottomToTopMs",
    label: "Max latest BOTTOM → TOP",
  },
  {
    key: "avgTopToBottomMs",
    label: "Avg latest TOP → BOTTOM",
  },
  {
    key: "maxTopToBottomMs",
    label: "Max latest TOP → BOTTOM",
  },
];

function formatDate(value: number | null) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatMarketCap(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatDuration(value: number | null | undefined) {
  return value == null ? "—" : moment.duration(value).humanize();
}

function formatMonthlyRate(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPercent(value: number | null) {
  return value === null
    ? "—"
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function LevelExtremeCell({
  level,
  timestamp,
}: {
  level: number | null;
  timestamp: number | null | undefined;
}) {
  return (
    <TableCell sx={{ minWidth: 92 }}>
      <Typography variant="body2">{level ?? "—"}</Typography>
      {timestamp != null && (
        <Typography color="text.secondary" display="block" variant="caption">
          {formatDate(timestamp)}
        </Typography>
      )}
    </TableCell>
  );
}

export default function CoinResultsTable({
  availableTags,
  coinDescriptions,
  coinTags,
  onCoinDescriptionChange,
  onCoinTagsChange,
  results,
  tagColors,
  tagDescriptions,
  volatilityMap,
}: {
  availableTags: string[];
  coinDescriptions: Record<string, string>;
  coinTags: Record<string, string[]>;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  results: CoinFinderResult[];
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  volatilityMap: CoinFinderVolatilityMap;
}) {
  const [sortKey, setSortKey] = useState<CoinResultSortKey>("symbol");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const visibleResults = useMemo(
    () =>
      filterAndSortCoinResults({
        direction,
        filters: EMPTY_COIN_RESULT_FILTERS,
        results,
        sortKey,
      }),
    [direction, results, sortKey],
  );

  const changeSort = (nextKey: CoinResultSortKey) => {
    if (nextKey === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setDirection("asc");
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
        Showing {visibleResults.length} of {results.length} coins
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell key={column.key}>
                  <TableSortLabel
                    active={sortKey === column.key}
                    direction={sortKey === column.key ? direction : "asc"}
                    onClick={() => changeSort(column.key)}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleResults.map((result) => {
              const warnFirstSeen = isFirstSeenYoungerThanMonths({
                firstSeen: result.firstSeen,
                minimumMonths: 6,
              });

              return (
                <TableRow hover key={`${result.range}-${result.symbol}`}>
                  <TableCell sx={{ minWidth: 210 }}>
                    <DisplayCoinSymbol symbol={result.symbol} />
                    <Box sx={{ mt: 0.75 }}>
                      <CoinMetadataEditor
                        availableTags={availableTags}
                        description={coinDescriptions[result.symbol] ?? ""}
                        onDescriptionChange={(description) =>
                          onCoinDescriptionChange(result.symbol, description)
                        }
                        onTagsChange={(tags) =>
                          onCoinTagsChange(result.symbol, tags)
                        }
                        tagColors={tagColors}
                        tagDescriptions={tagDescriptions}
                        tags={coinTags[result.symbol] ?? []}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        color: warnFirstSeen ? "warning.main" : "text.primary",
                        fontWeight: warnFirstSeen ? 700 : 400,
                      }}
                      variant="body2"
                    >
                      {formatDate(result.firstSeen)}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatMarketCap(result.marketCapUSD)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <CoinHealthScore
                      reasons={result.healthReasons ?? []}
                      score={result.healthScore}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <CoinCorrelationScore
                      correlations={result.correlations ?? {}}
                      score={result.correlationScore}
                    />
                  </TableCell>
                  <TableCell>
                    {result.entrySequenceCount?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell>
                    {formatMonthlyRate(result.entrySignalsPerMonth)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.holdDurationMinMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.holdDurationAvgMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.holdDurationMaxMs)}
                  </TableCell>
                  <TableCell>
                    {formatMonthlyRate(result.vPointsPerMonth)}
                  </TableCell>
                  <LevelExtremeCell
                    level={result.maxTop}
                    timestamp={result.maxTopT}
                  />
                  <LevelExtremeCell
                    level={result.maxBottom}
                    timestamp={result.maxBottomT}
                  />
                  <TableCell>{result.maxLevelAbsolute ?? "—"}</TableCell>
                  <TableCell sx={{ minWidth: 190 }}>
                    <Typography fontWeight={600} variant="body2">
                      {result.pointCount.toLocaleString()}
                    </Typography>
                    <VPointLevelFrequency
                      frequency={result.levelFrequency ?? {}}
                    />
                  </TableCell>
                  <TableCell>
                    {result.vPointCloseDistanceOccurrences.toLocaleString()}
                  </TableCell>
                  <TableCell>{formatPercent(result.vPointPctMin)}</TableCell>
                  <TableCell sx={{ minWidth: 400, verticalAlign: "top" }}>
                    <Typography variant="body2">
                      {formatPercent(result.vPointPctMax)}
                    </Typography>
                    {result.vPointPctMaxT !== null && (
                      <Typography
                        color="text.secondary"
                        display="block"
                        variant="caption"
                      >
                        {formatDate(result.vPointPctMaxT)}
                      </Typography>
                    )}
                    <CoinVPointPctDistribution
                      points={volatilityMap[result.symbol] ?? []}
                      range={result.range}
                    />
                  </TableCell>
                  <TableCell>{formatPercent(result.vPointPctAvg)}</TableCell>
                  <TableCell>
                    {formatDuration(result.vPointTransitionMinMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.vPointTransitionAvgMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.vPointTransitionMaxMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.avgBottomToTopMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.maxBottomToTopMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.avgTopToBottomMs)}
                  </TableCell>
                  <TableCell>
                    {formatDuration(result.maxTopToBottomMs)}
                  </TableCell>
                  <TableCell>
                    <CoinChartDialog
                      range={result.range}
                      symbol={result.symbol}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {visibleResults.length === 0 && (
              <TableRow>
                <TableCell colSpan={27} align="center">
                  No coins match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
