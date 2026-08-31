"use client";

import { Box, Grid, Paper, Tooltip, Typography } from "@mui/material";
import { type ReactNode, useMemo } from "react";

import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import slowTradingClient, {
  type SlowSystemCapacityEstimate,
  type SlowWorkerNeededEstimate,
} from "@/lib/slowTrading/client";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { DynamicTradeConfig, VolatilityPoint } from "@/lib/dynamic";
import entrySequenceCandidates from "./entry-sequence-candidates";

const WORKER_NEEDED_CHART_COLOR = "#1565c0";
const CAPITAL_NEEDED_CHART_COLOR = "#ef6c00";

function formatWorkerValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatCompactUsdt(value: number) {
  if (!Number.isFinite(value)) return "$0";

  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 1 : 2,
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function formatFullUsdt(value: number) {
  if (!Number.isFinite(value)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
}

function metricLabel(label: string, value: ReactNode) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography fontWeight={700} variant="h6">
        {value}
      </Typography>
    </Paper>
  );
}

function metricTooltip(title: ReactNode, value: ReactNode) {
  return (
    <Tooltip arrow placement="top" title={title}>
      <Box
        component="span"
        sx={{
          borderBottom: "1px dotted currentColor",
          cursor: "help",
          display: "inline-block",
        }}
      >
        {value}
      </Box>
    </Tooltip>
  );
}

function tooltipContent(lines: string[]) {
  return (
    <Box sx={{ maxWidth: 360 }}>
      {lines.map((line) => (
        <Typography
          color="inherit"
          key={line}
          sx={{ display: "block" }}
          variant="caption"
        >
          {line}
        </Typography>
      ))}
    </Box>
  );
}

function buildEffectiveBalanceTooltip({
  config,
  estimate,
}: {
  config: DynamicTradeConfig;
  estimate: SlowSystemCapacityEstimate;
}) {
  const maxEntryPct = config.maxEntryBased24HourVolPct ?? 0.2;

  return tooltipContent([
    "Peak effective capital needed at one time in the current range.",
    "For each active sequence: fitted entry margin + reserve ladder + base-margin buffer.",
    `Entry margin is fitted with 24h volume × ${formatPercent(maxEntryPct)}, max entry %, fixed max entry, and watch reserve settings.`,
    "At every timestamp SLOW sums active sequence capital. This card shows the maximum sum.",
    `Current result: ${formatFullUsdt(
      estimate.metrics.maxEffectiveCapitalUsdt,
    )}.`,
  ]);
}

function buildMaxProfitUsdtTooltip({
  config,
  estimate,
}: {
  config: DynamicTradeConfig;
  estimate: SlowSystemCapacityEstimate;
}) {
  const takeProfitPct = config.modelConfig?.takeProfitPercent ?? 0;

  return tooltipContent([
    "Total take-profit potential for all captured sequences in this range.",
    "Per sequence: entry margin × (take profit % × leverage) / 100.",
    `Configured take profit: ${formatPercent(takeProfitPct)}. Leverage comes from the current entry leverage rules.`,
    `Current result: ${formatFullUsdt(estimate.metrics.maxProfitUsdt)}.`,
  ]);
}

function buildMaxProfitPctTooltip(estimate: SlowSystemCapacityEstimate) {
  return tooltipContent([
    "Profit efficiency against required effective balance.",
    "Formula: max TP profit USDT / effective balance × 100.",
    `${formatFullUsdt(estimate.metrics.maxProfitUsdt)} / ${formatFullUsdt(
      estimate.metrics.maxEffectiveCapitalUsdt,
    )} × 100 = ${formatPercent(estimate.metrics.maxProfitPct)}.`,
  ]);
}

function buildWorkerNeededChartTooltip() {
  return tooltipContent([
    "Shows how many worker slots are occupied over time.",
    "A worker starts when one configured coin enters an entry sequence: abs(vPoint level) >= 3.",
    "The worker is released when that coin returns to level 0, or when the sequence direction changes.",
    "The chart value is the count of overlapping active entry sequences at each timestamp.",
  ]);
}

function buildCapitalNeededChartTooltip(config: DynamicTradeConfig) {
  const maxEntryPct = config.maxEntryBased24HourVolPct ?? 0.2;

  return tooltipContent([
    "Shows the effective capital needed over time to support the active workers.",
    `For each sequence, SLOW starts from 24h quote volume × ${formatPercent(maxEntryPct)}.`,
    "Then it runs the same entry sizing logic used by trading: reserve ladder, max entry %, fixed max entry, trading mode, and leverage config.",
    "Per active sequence capital: fitted entry margin + reserved averaging ladder + base-margin buffer.",
    "The chart value is the sum of active sequence capital at each timestamp.",
  ]);
}

function chartHeader({
  color,
  title,
  tooltip,
}: {
  color: string;
  title: string;
  tooltip: ReactNode;
}) {
  return (
    <Box
      sx={{
        alignItems: "center",
        display: "flex",
        gap: 0.75,
        mt: 1,
      }}
    >
      <Box
        sx={{
          bgcolor: color,
          borderRadius: 0.5,
          height: 10,
          width: 10,
        }}
      />
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {metricTooltip(tooltip, title)}
      </Typography>
    </Box>
  );
}

/**
 * Converts worker-needed points into the shared timeline chart marker shape.
 */
function makeWorkerNeededSeries(
  estimate: SlowWorkerNeededEstimate,
): LeveledMarkers[] {
  return estimate.points.map((point) => ({
    color: WORKER_NEEDED_CHART_COLOR,
    level: point.v,
    text: `Worker needed: ${formatWorkerValue(point.v)}`,
    time: Math.floor(point.t / 1000),
  }));
}

function makeCapitalNeededSeries(
  estimate: SlowSystemCapacityEstimate,
): LeveledMarkers[] {
  return estimate.capitalPoints.map((point) => ({
    color: CAPITAL_NEEDED_CHART_COLOR,
    level: point.v,
    text: `Effective capital needed: ${formatFullUsdt(point.v)}`,
    time: Math.floor(point.t / 1000),
  }));
}

export default function WorkerNeededEstimation({
  config,
  endTime,
  startTime,
  volume24hBySymbol,
  volatilityMap,
}: {
  config: DynamicTradeConfig;
  endTime?: number;
  startTime?: number;
  volume24hBySymbol?: Record<string, number>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  return (
    <HeaderMetrics
      title={
        <Typography fontWeight="bold" variant="body1">
          System Maximal Capacity
        </Typography>
      }
    >
      {(expand) => (
        <>
          {expand && (
            <WorkerNeededEstimationContent
              config={config}
              endTime={endTime}
              startTime={startTime}
              volume24hBySymbol={volume24hBySymbol}
              volatilityMap={volatilityMap}
            />
          )}
        </>
      )}
    </HeaderMetrics>
  );
}

function WorkerNeededEstimationContent({
  config,
  endTime,
  startTime,
  volume24hBySymbol,
  volatilityMap,
}: {
  config: DynamicTradeConfig;
  endTime?: number;
  startTime?: number;
  volume24hBySymbol?: Record<string, number>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  const estimate = useMemo(() => {
    const rangedVolatilityMap = slowTradingClient.entrySequences.range.crop({
      endTimeMs: endTime,
      startTimeMs: startTime,
      volatilityMap,
    });

    return slowTradingClient.entrySequences.systemCapacity.estimate({
      config,
      endTimeMs: endTime,
      entrySignals: entrySequenceCandidates.build({
        minActionableAbsoluteLevel: config.minActionableAbsoluteLevel,
        volatilityMap: rangedVolatilityMap,
      }),
      startTimeMs: startTime,
      volatilityMap: rangedVolatilityMap,
      volume24hBySymbol,
    });
  }, [config, endTime, startTime, volatilityMap, volume24hBySymbol]);
  const workerEstimate: SlowWorkerNeededEstimate = useMemo(
    () => ({
      metrics: {
        avg: estimate.metrics.avgWorkers,
        max: estimate.metrics.maxWorkers,
        min: estimate.metrics.minWorkers,
      },
      points: estimate.workerPoints,
    }),
    [estimate],
  );
  const workerSeries = useMemo(
    () => makeWorkerNeededSeries(workerEstimate),
    [workerEstimate],
  );
  const capitalSeries = useMemo(
    () => makeCapitalNeededSeries(estimate),
    [estimate],
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Typography color="text.secondary" variant="caption">
        Client-side estimate from current ranged vPoints, current trade config,
        and the same 24h-volume max-entry cap used by Latest Volatility Points.
      </Typography>
      <Grid container spacing={1} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricLabel(
            "Effective balance",
            metricTooltip(
              buildEffectiveBalanceTooltip({ config, estimate }),
              formatCompactUsdt(estimate.metrics.maxEffectiveCapitalUsdt),
            ),
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricLabel(
            "Max TP profit",
            <>
              {metricTooltip(
                buildMaxProfitUsdtTooltip({ config, estimate }),
                formatCompactUsdt(estimate.metrics.maxProfitUsdt),
              )}{" "}
              (
              {metricTooltip(
                buildMaxProfitPctTooltip(estimate),
                formatPercent(estimate.metrics.maxProfitPct),
              )}
              )
            </>,
          )}
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          {metricLabel("Sequences", formatWorkerValue(estimate.metrics.sequenceCount))}
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          {metricLabel("Avg workers", formatWorkerValue(estimate.metrics.avgWorkers))}
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          {metricLabel("Max workers", formatWorkerValue(estimate.metrics.maxWorkers))}
        </Grid>
      </Grid>

      {workerSeries.length > 0 ? (
        <Box sx={{ mt: 1 }}>
          {chartHeader({
            color: WORKER_NEEDED_CHART_COLOR,
            title: "Worker needed",
            tooltip: buildWorkerNeededChartTooltip(),
          })}
          <MultiLineTimelined
            colors={[WORKER_NEEDED_CHART_COLOR]}
            height={220}
            names={["Worker Needed"]}
            series={[workerSeries]}
          />
          {chartHeader({
            color: CAPITAL_NEEDED_CHART_COLOR,
            title: "Capital needed",
            tooltip: buildCapitalNeededChartTooltip(config),
          })}
          <MultiLineTimelined
            colors={[CAPITAL_NEEDED_CHART_COLOR]}
            height={240}
            names={["Effective Capital"]}
            series={[capitalSeries]}
            yTickFormatter={(value) => formatCompactUsdt(Number(value))}
          />
        </Box>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            color: "text.secondary",
            mt: 1,
            p: 2,
            textAlign: "center",
          }}
        >
          No system-capacity data in this range
        </Paper>
      )}
    </Box>
  );
}
