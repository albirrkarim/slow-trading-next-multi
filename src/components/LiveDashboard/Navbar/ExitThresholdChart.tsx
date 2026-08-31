"use client";

import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ExitThresholdChartPoint {
  event: string;
  minimumPnlPct: number | null;
  pnlPct: number | null;
}

export interface ExitThresholdChartModel {
  activationPct: number;
  data: ExitThresholdChartPoint[];
  domain: [number, number];
  hardStopPct: number | null;
  minimumExitPct: number;
  peakPct: number;
  stopLossPlusEnabled: boolean;
  takeProfitPct: number;
  targetZoneStopPct: number | null;
  triggerPct: number;
}

function roundPct(value: number): number {
  return Number(value.toFixed(4));
}

function formatPct(value: number, signed = false): string {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${Number(value.toFixed(2))}%`;
}

/**
 * Builds an illustrative PnL path from the configured exit thresholds.
 */
export function buildExitThresholdChartModel({
  stopLossPct,
  stopLossPlusEnabled,
  takeProfitPct,
  targetZoneStopLossPct,
  triggerPct,
}: {
  stopLossPct: number | null;
  stopLossPlusEnabled: boolean;
  takeProfitPct: number;
  targetZoneStopLossPct: number | null;
  triggerPct: number;
}): ExitThresholdChartModel {
  const normalizedTakeProfitPct = Math.max(0, takeProfitPct);
  const normalizedTriggerPct = Math.max(0, triggerPct);
  const activationPct = normalizedTakeProfitPct;
  const minimumExitPct = roundPct(activationPct - normalizedTriggerPct);
  const peakPct = roundPct(activationPct + normalizedTriggerPct);
  const retraceExitPct = roundPct(peakPct - normalizedTriggerPct);
  const hardStopPct =
    stopLossPct === null ? null : -Math.max(0, stopLossPct);
  const targetZoneStopPct =
    targetZoneStopLossPct === null
      ? null
      : -Math.max(0, targetZoneStopLossPct);
  const data: ExitThresholdChartPoint[] = stopLossPlusEnabled
    ? [
        { event: "Entry", minimumPnlPct: null, pnlPct: 0 },
        {
          event: "TP + Active",
          minimumPnlPct: activationPct,
          pnlPct: activationPct,
        },
        {
          event: "Initial min",
          minimumPnlPct: minimumExitPct,
          pnlPct: null,
        },
        { event: "Peak", minimumPnlPct: null, pnlPct: peakPct },
        { event: "SL+ exit", minimumPnlPct: null, pnlPct: retraceExitPct },
      ]
    : [
        { event: "Entry", minimumPnlPct: null, pnlPct: 0 },
        {
          event: "TP target",
          minimumPnlPct: null,
          pnlPct: normalizedTakeProfitPct,
        },
      ];
  const lowestPct = Math.min(
    0,
    hardStopPct ?? 0,
    minimumExitPct,
    targetZoneStopPct ?? 0,
  );
  const highestPct = Math.max(
    1,
    ...data.flatMap((point) =>
      [point.pnlPct, point.minimumPnlPct].filter(
        (value): value is number => value !== null,
      ),
    ),
  );
  const padding = Math.max(1, (highestPct - lowestPct) * 0.08);
  const domain: [number, number] = [
    Math.floor((lowestPct - padding) * 10) / 10,
    Math.ceil((highestPct + padding) * 10) / 10,
  ];

  return {
    activationPct,
    data,
    domain,
    hardStopPct,
    minimumExitPct,
    peakPct,
    stopLossPlusEnabled,
    takeProfitPct: normalizedTakeProfitPct,
    targetZoneStopPct,
    triggerPct: normalizedTriggerPct,
  };
}

function ThresholdLegendItem({
  color,
  label,
  testId,
  value,
}: {
  color: string;
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <Stack
      alignItems="center"
      data-testid={testId}
      direction="row"
      gap={0.75}
      minWidth={0}
    >
      <Box
        sx={{
          bgcolor: color,
          flex: "0 0 auto",
          height: 3,
          width: 18,
        }}
      />
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Typography
        fontWeight={700}
        sx={{ fontVariantNumeric: "tabular-nums" }}
        variant="caption"
      >
        {value}
      </Typography>
    </Stack>
  );
}

export default function ExitThresholdChart({
  stopLossPct,
  stopLossPlusEnabled,
  takeProfitPct,
  targetZoneStopLossPct,
  triggerPct,
}: {
  stopLossPct: number | null;
  stopLossPlusEnabled: boolean;
  takeProfitPct: number;
  targetZoneStopLossPct: number | null;
  triggerPct: number;
}) {
  const theme = useTheme();
  const chart = buildExitThresholdChartModel({
    stopLossPct,
    stopLossPlusEnabled,
    takeProfitPct,
    targetZoneStopLossPct,
    triggerPct,
  });

  return (
    <Box data-testid="exit-threshold-chart">
      <Typography fontWeight={700} variant="body2">
        Exit thresholds
      </Typography>
      <Box
        aria-label="Exit threshold chart"
        role="img"
        sx={{ height: 240, mt: 0.75, minWidth: 0, width: "100%" }}
      >
        <ResponsiveContainer height="100%" minWidth={0} width="100%">
          <LineChart
            data={chart.data}
            margin={{ bottom: 16, left: 0, right: 28, top: 16 }}
          >
            <CartesianGrid
              stroke={alpha(theme.palette.text.primary, 0.12)}
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="event"
              interval={0}
              tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={chart.domain}
              tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
              tickFormatter={(value) => formatPct(Number(value))}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 4,
                boxShadow: theme.shadows[2],
                fontSize: 12,
              }}
              formatter={(value) => [
                formatPct(Number(value), true),
                "Net PnL",
              ]}
              isAnimationActive={false}
            />
            <ReferenceLine
              stroke={theme.palette.success.main}
              strokeDasharray="5 4"
              y={chart.takeProfitPct}
            />
            {chart.stopLossPlusEnabled && (
              <ReferenceLine
                stroke={theme.palette.info.main}
                strokeDasharray="3 4"
                y={chart.minimumExitPct}
              />
            )}
            {chart.hardStopPct !== null && (
              <ReferenceLine
                stroke={theme.palette.error.main}
                strokeDasharray="5 4"
                y={chart.hardStopPct}
              />
            )}
            {chart.targetZoneStopPct !== null && (
              <ReferenceLine
                stroke={theme.palette.warning.dark}
                strokeDasharray="2 3"
                y={chart.targetZoneStopPct}
              />
            )}
            <Line
              connectNulls
              dataKey="pnlPct"
              dot={{
                fill: theme.palette.primary.main,
                r: 3,
                strokeWidth: 0,
              }}
              isAnimationActive={false}
              name="Net PnL"
              stroke={theme.palette.primary.main}
              strokeWidth={2}
              type="linear"
            />
            {chart.stopLossPlusEnabled && (
              <Line
                dataKey="minimumPnlPct"
                dot={{
                  fill: theme.palette.info.main,
                  r: 3,
                  strokeWidth: 0,
                }}
                isAnimationActive={false}
                name="Initial minimum path"
                stroke={theme.palette.info.main}
                strokeDasharray="6 4"
                strokeWidth={2}
                type="linear"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Box
        sx={{
          columnGap: 1.5,
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            sm: "repeat(2, minmax(0, 1fr))",
          },
          rowGap: 0.5,
        }}
      >
        <ThresholdLegendItem
          color={theme.palette.success.main}
          label="TP target"
          testId="threshold-take-profit"
          value={formatPct(chart.takeProfitPct, true)}
        />
        <ThresholdLegendItem
          color={theme.palette.error.main}
          label="Hard SL"
          testId="threshold-hard-stop"
          value={
            chart.hardStopPct === null
              ? "Disabled"
              : formatPct(chart.hardStopPct)
          }
        />
        <ThresholdLegendItem
          color={theme.palette.warning.main}
          label="SL+ active"
          testId="threshold-stop-loss-plus-active"
          value={
            chart.stopLossPlusEnabled
              ? formatPct(chart.activationPct, true)
              : "Disabled"
          }
        />
        <ThresholdLegendItem
          color={theme.palette.info.main}
          label="SL+ minimum"
          testId="threshold-stop-loss-plus-minimum"
          value={
            chart.stopLossPlusEnabled
              ? formatPct(chart.minimumExitPct, true)
              : "Disabled"
          }
        />
        <ThresholdLegendItem
          color={theme.palette.primary.main}
          label="SL+ retrace"
          testId="threshold-stop-loss-plus-retrace"
          value={
            chart.stopLossPlusEnabled
              ? formatPct(chart.triggerPct)
              : "Disabled"
          }
        />
        <ThresholdLegendItem
          color={theme.palette.warning.dark}
          label="Target-zone SL"
          testId="threshold-target-zone-stop"
          value={
            chart.targetZoneStopPct === null
              ? "Disabled"
              : formatPct(chart.targetZoneStopPct)
          }
        />
      </Box>
      {chart.targetZoneStopPct !== null && (
        <Typography
          color="text.secondary"
          display="block"
          mt={0.5}
          variant="caption"
        >
          Target-zone SL becomes active only after LONG reaches a TOP or SHORT
          reaches a BOTTOM following entry.
        </Typography>
      )}
      {chart.stopLossPlusEnabled && (
        <Typography color="text.secondary" display="block" mt={0.5} variant="caption">
          Minimum: {formatPct(chart.activationPct, true)} TP -{" "}
          {formatPct(chart.triggerPct)} retrace ={" "}
          {formatPct(chart.minimumExitPct, true)}. Example after a{" "}
          {formatPct(chart.peakPct, true)} peak: exit near{" "}
          {formatPct(chart.peakPct - chart.triggerPct, true)}. Execution timing
          and slippage can vary the realized fill.
        </Typography>
      )}
    </Box>
  );
}
