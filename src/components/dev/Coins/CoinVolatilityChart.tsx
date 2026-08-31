"use client";

import { DEFAULT_COLORS } from "@/components/client/constants";
import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import { makeSeries } from "@/components/LiveDashboard/utils";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import type { CoinFinderVolatilityMap } from "@/lib/devBacktest/coins/types";
import type { CoinCombinationAnalysis } from "@/lib/devBacktest/coins/capital-efficiency";
import { Box } from "@mui/material";
import { useMemo } from "react";
import CoinCombinationSummary from "./CoinCombinationSummary";
import CoinThresholdSummary from "./CoinThresholdSummary";
import { analyzeThresholdEntries } from "./threshold-analysis";
import HeaderMetrics from "../Evaluation/HeaderMetrics";

export default function CoinVolatilityChart({
  combinationAnalysis,
  maximumAvailableLevel,
  requestedCombinationSize,
  threshold,
  volatilityMap,
}: {
  combinationAnalysis: CoinCombinationAnalysis;
  maximumAvailableLevel: number;
  requestedCombinationSize: number;
  threshold: [number, number];
  volatilityMap: CoinFinderVolatilityMap;
}) {
  const data = useMemo(
    () => makeSeries(volatilityMap, DEFAULT_COLORS),
    [volatilityMap],
  );
  const names = useMemo(() => Object.keys(volatilityMap), [volatilityMap]);
  const effectiveThreshold = useMemo<[number, number]>(
    () => [
      Math.min(threshold[0], maximumAvailableLevel - 1),
      Math.min(threshold[1], maximumAvailableLevel),
    ],
    [maximumAvailableLevel, threshold],
  );

  const analysis = useMemo(
    () =>
      analyzeThresholdEntries({
        maximumLevel: effectiveThreshold[1],
        minimumLevel: effectiveThreshold[0],
        volatilityMap,
      }),
    [effectiveThreshold, volatilityMap],
  );
  const entrySeries = useMemo<LeveledMarkers[][]>(
    () =>
      analysis.entries.map((entry) => [
        {
          color: entry.direction === "SHORT" ? "red" : "green",
          level: entry.point.lvl,
          text: `${entry.symbol} Entry ${entry.direction} at level ${entry.point.lvl}`,
          time: Math.floor(entry.point.t / 1000),
        },
      ]),
    [analysis.entries],
  );
  const chartSeries = useMemo(
    () => [...data.series, ...entrySeries],
    [data.series, entrySeries],
  );
  const chartNames = useMemo(
    () => [
      ...names,
      ...analysis.entries.map((entry) => `ENTRY ${entry.direction}`),
    ],
    [analysis.entries, names],
  );

  if (data.series.length === 0) return null;

  return (
    <Box sx={{ mt: 3, mb: 2 }}>

      <CoinCombinationSummary
        analysis={combinationAnalysis}
        requestedSize={requestedCombinationSize}
      />

      <HeaderMetrics title="V points charts">
        {(expand) => (
          <>
            {expand && (
              <MultiLineTimelined
                defaultShowEntryGroups
                names={chartNames}
                series={chartSeries}
              />
            )}
          </>
        )}
      </HeaderMetrics>

      <CoinThresholdSummary analysis={analysis} />
    </Box>
  );
}
