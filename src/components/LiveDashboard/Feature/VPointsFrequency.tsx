"use client";

import { alpha, Box, Paper, Tooltip, Typography } from "@mui/material";
import { useMemo } from "react";

import HeaderMetrics from "@/components/ui/HeaderMetrics";
import VPointPctDistribution from "@/components/ui/VPointPctDistribution";
import type { VolatilityPoint } from "@/lib/dynamic";
import slowTradingClient from "@/lib/slowTrading/client";

export interface VPointLevelFrequency {
  count: number;
  level: number;
}

export interface VPointLevelProgression {
  direction: "down" | "up";
  exactPct: number;
  pct: number;
  targetCount: number;
  targetLevel: number;
}

export interface VPointPctMetrics {
  avg: number | null;
  max: number | null;
  min: number | null;
}

export interface VPointLevelMaxDrawdown extends VPointPctMetrics {
  count: number;
  targetLevels: number[];
}

export interface RangedVPointsSummary {
  frequencies: VPointLevelFrequency[];
  pct: VPointPctMetrics;
  total: number;
}

/** Returns all vPoints inside the selected dashboard time range. */
function getRangedVPoints({
  endTime,
  startTime,
  volatilityMap,
}: {
  endTime?: number;
  startTime?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): VolatilityPoint[] {
  const rangedVolatilityMap = slowTradingClient.entrySequences.range.crop({
    endTimeMs: endTime,
    startTimeMs: startTime,
    volatilityMap,
  });
  return Object.values(rangedVolatilityMap).flat();
}

/** Summarizes an already ranged collection of vPoints. */
function summarizeVPoints(points: VolatilityPoint[]): RangedVPointsSummary {
  const countByLevel = new Map<number, number>();
  const pctValues: number[] = [];

  for (const point of points) {
    if (Number.isFinite(point.pct)) pctValues.push(point.pct);
    if (!Number.isInteger(point.lvl)) continue;
    countByLevel.set(point.lvl, (countByLevel.get(point.lvl) ?? 0) + 1);
  }

  const observedLevels = [...countByLevel.keys()];
  const frequencies: VPointLevelFrequency[] = [];

  if (observedLevels.length > 0) {
    const maximumLevel = Math.max(...observedLevels);
    const minimumLevel = Math.min(...observedLevels);

    frequencies.push(
      ...Array.from(
        { length: maximumLevel - minimumLevel + 1 },
        (_, index) => {
          const level = maximumLevel - index;
          return { count: countByLevel.get(level) ?? 0, level };
        },
      ),
    );
  }

  return {
    frequencies,
    pct: {
      avg:
        pctValues.length > 0
          ? pctValues.reduce((sum, pct) => sum + pct, 0) / pctValues.length
          : null,
      max: pctValues.length > 0 ? Math.max(...pctValues) : null,
      min: pctValues.length > 0 ? Math.min(...pctValues) : null,
    },
    total: points.length,
  };
}

/** Summarizes each level's next outward-level pct values as drawdown samples. */
export function summarizeVPointLevelMaxDrawdowns(
  points: Pick<VolatilityPoint, "lvl" | "pct">[],
): Map<number, VPointLevelMaxDrawdown> {
  const valuesBySourceLevel = new Map<number, number[]>();

  for (const point of points) {
    if (
      !Number.isInteger(point.lvl) ||
      point.lvl === 0 ||
      !Number.isFinite(point.pct)
    ) {
      continue;
    }

    const sourceLevel = point.lvl > 0 ? point.lvl - 1 : point.lvl + 1;
    const current = valuesBySourceLevel.get(sourceLevel) ?? [];
    current.push(point.pct);
    valuesBySourceLevel.set(sourceLevel, current);
  }

  return new Map(
    [...valuesBySourceLevel.entries()].map(
      ([sourceLevel, values]) => [
        sourceLevel,
        {
          avg: values.reduce((sum, value) => sum + value, 0) / values.length,
          count: values.length,
          max: Math.max(...values),
          min: Math.min(...values),
          targetLevels:
            sourceLevel === 0
              ? [1, -1]
              : [sourceLevel + (sourceLevel > 0 ? 1 : -1)],
        },
      ],
    ),
  );
}

/** Explains which outward vPoint pct samples feed one level's Max DD. */
export function buildVPointLevelMaxDrawdownTooltip(
  level: number,
  metric?: VPointLevelMaxDrawdown,
): string {
  const defaultTargetLevels =
    level === 0 ? [1, -1] : [level + (level > 0 ? 1 : -1)];
  const targetLevels = metric?.targetLevels.length
    ? metric.targetLevels
    : defaultTargetLevels;
  const targetLabel = targetLevels
    .map((targetLevel) => `Level ${targetLevel}`)
    .join(" and ");
  const sampleLabel = metric
    ? `the ${metric.count.toLocaleString()} matching vPoint${metric.count === 1 ? "" : "s"}`
    : "no matching vPoints because none are available";

  return `Level ${level} Max DD uses pct from ${targetLabel} vPoints in the selected range. Each pct is the price-movement magnitude from the preceding pivot to that outward level. Max, avg, and min summarize ${sampleLabel}.`;
}

/** Calculates the whole-percent progression from one level to the next. */
export function calculateVPointLevelProgressionPct({
  count,
  lowerCount,
}: {
  count: number;
  lowerCount: number;
}): number | null {
  if (
    !Number.isFinite(count) ||
    count < 0 ||
    !Number.isFinite(lowerCount) ||
    lowerCount <= 0
  ) {
    return null;
  }

  return Math.floor((count / lowerCount) * 100);
}

/** Calculates a level row's proportional heat-map width. */
export function calculateVPointLevelHeatPct({
  count,
  maximumCount,
}: {
  count: number;
  maximumCount: number;
}): number {
  if (
    !Number.isFinite(count) ||
    count <= 0 ||
    !Number.isFinite(maximumCount) ||
    maximumCount <= 0
  ) {
    return 0;
  }

  return Math.min(100, (count / maximumCount) * 100);
}

/** Builds the outward level progressions available from one vPoint level. */
export function getVPointLevelProgressions({
  countByLevel,
  level,
}: {
  countByLevel: ReadonlyMap<number, number>;
  level: number;
}): VPointLevelProgression[] {
  const count = countByLevel.get(level);
  if (count === undefined) return [];

  const targets = [
    ...(level >= 0
      ? [{ direction: "up" as const, targetLevel: level + 1 }]
      : []),
    ...(level <= 0
      ? [{ direction: "down" as const, targetLevel: level - 1 }]
      : []),
  ];

  return targets.flatMap(({ direction, targetLevel }) => {
    const targetCount = countByLevel.get(targetLevel);
    if (targetCount === undefined) return [];

    const pct = calculateVPointLevelProgressionPct({
      count: targetCount,
      lowerCount: count,
    });
    if (pct === null) return [];

    return [
      {
        direction,
        exactPct: (targetCount / count) * 100,
        pct,
        targetCount,
        targetLevel,
      },
    ];
  });
}

/** Summarizes vPoints within the selected dashboard time range. */
export function summarizeRangedVPoints({
  endTime,
  startTime,
  volatilityMap,
}: {
  endTime?: number;
  startTime?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): RangedVPointsSummary {
  return summarizeVPoints(
    getRangedVPoints({ endTime, startTime, volatilityMap }),
  );
}

/** Counts vPoints in a time range from the highest observed level downward. */
export function countRangedVPointLevelFrequency({
  endTime,
  startTime,
  volatilityMap,
}: {
  endTime?: number;
  startTime?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): VPointLevelFrequency[] {
  return summarizeRangedVPoints({ endTime, startTime, volatilityMap })
    .frequencies;
}

function formatVPointPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatLevelMaxDrawdown(metric?: VPointLevelMaxDrawdown): string {
  if (!metric) return "Max DD —";

  return `Max DD (max: ${formatVPointPct(metric.max)}, avg: ${formatVPointPct(metric.avg)}, min: ${formatVPointPct(metric.min)})`;
}

export default function VPointsFrequency({
  endTime,
  startTime,
  volatilityMap,
}: {
  endTime?: number;
  startTime?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  return (
    <HeaderMetrics
      defaultExpanded={false}
      rememberExpand="vpoints-frequency"
      title={
        <Typography fontWeight="bold" variant="body1">
          VPoints Summary
        </Typography>
      }
      headerCanBeClicked
    >
      {(expanded) =>
        expanded && (
          <VPointsFrequencyContent
            endTime={endTime}
            startTime={startTime}
            volatilityMap={volatilityMap}
          />
        )
      }
    </HeaderMetrics>
  );
}

function VPointsFrequencyContent({
  endTime,
  startTime,
  volatilityMap,
}: {
  endTime?: number;
  startTime?: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  const { points, summary } = useMemo(() => {
    const rangedPoints = getRangedVPoints({
      endTime,
      startTime,
      volatilityMap,
    });
    return {
      points: rangedPoints,
      // PROD:VPOINTS_FREQUENCY
      // PROD:VPOINTS_SUMMARY_PCT
      summary: summarizeVPoints(rangedPoints),
    };
  }, [endTime, startTime, volatilityMap]);
  const frequencies = summary.frequencies;
  const countByLevel = new Map(
    frequencies.map(({ count, level }) => [level, count]),
  );
  const maxDrawdownByLevel = useMemo(
    () => summarizeVPointLevelMaxDrawdowns(points),
    [points],
  );
  const maximumCount = Math.max(...frequencies.map(({ count }) => count));

  if (frequencies.length === 0) {
    return (
      <Paper
        sx={{ color: "text.secondary", mt: 1, p: 2, textAlign: "center" }}
        variant="outlined"
      >
        No vPoints in this range
      </Paper>
    );
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography color="text.secondary" variant="caption">
        {summary.total.toLocaleString()} vPoints · current range
      </Typography>
      <Box
        aria-label="Current range vPoint percentage metrics"
        sx={{
          display: "grid",
          gap: 0.75,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          mt: 0.75,
        }}
      >
        {(
          [
            ["Max", summary.pct.max],
            ["Avg", summary.pct.avg],
            ["Min", summary.pct.min],
          ] as const
        ).map(([label, value]) => (
          <Paper
            key={label}
            sx={{ minWidth: 0, px: 1, py: 0.75, textAlign: "center" }}
            variant="outlined"
          >
            <Typography color="text.secondary" display="block" variant="caption">
              {label} pct
            </Typography>
            <Typography fontWeight={700} noWrap variant="body2">
              {formatVPointPct(value)}
            </Typography>
          </Paper>
        ))}
      </Box>
      <VPointPctDistribution points={points} rangeLabel="current" />
      <Paper sx={{ mt: 0.75 }} variant="outlined">
        {frequencies.map(({ count, level }, index) => {
          const progressions = getVPointLevelProgressions({
            countByLevel,
            level,
          });
          const heatPct = calculateVPointLevelHeatPct({
            count,
            maximumCount,
          });
          const maxDrawdown = maxDrawdownByLevel.get(level);
          const maxDrawdownTooltip = buildVPointLevelMaxDrawdownTooltip(
            level,
            maxDrawdown,
          );

          return (
            <Box
              key={level}
              sx={{
                alignItems: "center",
                borderTop: index === 0 ? 0 : 1,
                borderColor: "divider",
                backgroundImage: (theme) =>
                  `linear-gradient(to left, ${alpha(theme.palette.primary.main, 0.28)}, ${alpha(theme.palette.primary.main, 0.08)} 68%, transparent)`,
                backgroundPosition: "right center",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${heatPct}% 100%`,
                display: "flex",
                justifyContent: "space-between",
                px: 1.25,
                py: 0.75,
              }}
            >
              <Box
                sx={{
                  alignItems: "baseline",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.75,
                  minWidth: 0,
                  pr: 1,
                }}
              >
                <Typography variant="body2">Level {level}</Typography>
                <Tooltip arrow enterTouchDelay={0} title={maxDrawdownTooltip}>
                  <Typography
                    aria-label={maxDrawdownTooltip}
                    color="text.secondary"
                    component="span"
                    sx={{
                      borderBottom: "1px dotted",
                      cursor: "help",
                      lineHeight: 1.35,
                    }}
                    tabIndex={0}
                    variant="caption"
                  >
                    {formatLevelMaxDrawdown(maxDrawdown)}
                  </Typography>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  alignItems: "baseline",
                  display: "flex",
                  gap: 0.75,
                  whiteSpace: "nowrap",
                }}
              >
                <Typography fontWeight={700} variant="body2">
                  {count.toLocaleString()}
                </Typography>
                {progressions.map(
                  ({
                    direction,
                    exactPct,
                    pct,
                    targetCount,
                    targetLevel,
                  }) => (
                    <Tooltip
                      arrow
                      key={direction}
                      title={`${targetCount.toLocaleString()} / ${count.toLocaleString()} × 100 = ${exactPct.toFixed(2)}% ${direction} to Level ${targetLevel}`}
                    >
                      <Typography
                        color="text.secondary"
                        component="span"
                        fontWeight={600}
                        variant="caption"
                      >
                        {pct}% {direction}
                      </Typography>
                    </Tooltip>
                  ),
                )}
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
