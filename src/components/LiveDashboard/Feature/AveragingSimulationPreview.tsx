"use client";

import TimelineIcon from "@mui/icons-material/Timeline";
import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
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

import type { TradingLivePreviewAveragingSimulation } from "./trading-live-preview";

function formatPct(value: number, signed = false): string {
  const prefix = signed && value >= 0 ? "+" : "";
  return prefix + Number(value.toFixed(2)) + "%";
}

function formatPrice(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function SimulationPoint({
  detail,
  point,
  title,
}: {
  detail: string;
  point: string;
  title: string;
}) {
  return (
    <Box minWidth={0}>
      <Typography color="text.secondary" variant="caption">
        {point}
      </Typography>
      <Typography fontWeight={700} variant="body2">
        {title}
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ overflowWrap: "anywhere" }}
        variant="caption"
      >
        {detail}
      </Typography>
    </Box>
  );
}

export default function AveragingSimulationPreview({
  simulation,
}: {
  simulation: TradingLivePreviewAveragingSimulation | null;
}) {
  const theme = useTheme();
  const hasProjection =
    simulation?.maxAdversePct !== null &&
    simulation?.projectedProfitPct !== null &&
    simulation?.targetPrice !== null;

  if (!simulation) {
    return (
      <Box data-testid="averaging-simulation-preview">
        <Stack alignItems="center" direction="row" gap={0.75} mb={0.75}>
          <TimelineIcon color="action" fontSize="small" />
          <Typography fontWeight={700} variant="body2">
            Averaging
          </Typography>
        </Stack>
        <Typography color="text.secondary" variant="body2">
          Averaging preview unavailable
        </Typography>
      </Box>
    );
  }

  if (!hasProjection) {
    return (
      <Box data-testid="averaging-simulation-preview">
        <Stack alignItems="center" direction="row" gap={0.75} mb={0.75}>
          <TimelineIcon color="action" fontSize="small" />
          <Typography fontWeight={700} variant="body2">
            Averaging
          </Typography>
        </Stack>
        <Typography color="error.main" fontWeight={700} variant="body2">
          {simulation.reserveMultiplier}x cannot preserve{" "}
          {formatPct(simulation.requiredProfitPct)} projected profit after an
          adverse move.
        </Typography>
      </Box>
    );
  }

  const data = [
    { event: "A Entry", price: simulation.entryPrice },
    { event: "B Average", price: simulation.adversePrice },
    { event: "C Target", price: simulation.targetPrice! },
  ];
  const prices = data.map((point) => point.price);
  const chartRange = Math.max(...prices) - Math.min(...prices);
  const chartPadding = Math.max(0.5, chartRange * 0.2);
  const domain: [number, number] = [
    Math.max(0, Math.min(...prices) - chartPadding),
    Math.max(...prices) + chartPadding,
  ];

  return (
    <Box data-testid="averaging-simulation-preview">
      <Stack alignItems="center" direction="row" gap={0.75} mb={0.75}>
        <TimelineIcon color="action" fontSize="small" />
        <Typography fontWeight={700} variant="body2">
          Averaging
        </Typography>
      </Stack>

      <Stack gap={0.5} mb={1}>
        <Stack direction="row" justifyContent="space-between" gap={1}>
          <Typography color="text.secondary" variant="body2">
            Maximum adverse vPoint
          </Typography>
          <Typography
            color="warning.main"
            fontWeight={700}
            sx={{ fontVariantNumeric: "tabular-nums" }}
            variant="body2"
          >
            {formatPct(simulation.maxAdversePct!)}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" gap={1}>
          <Typography color="text.secondary" variant="body2">
            Reserve multiplier
          </Typography>
          <Typography fontWeight={700} variant="body2">
            {simulation.reserveMultiplier}x
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" gap={1}>
          <Typography color="text.secondary" variant="body2">
            Projected profit at C
          </Typography>
          <Typography color="success.main" fontWeight={700} variant="body2">
            {formatPct(simulation.projectedProfitPct!, true)}
          </Typography>
        </Stack>
      </Stack>

      <Box sx={{ height: 180, minWidth: 0, width: "100%" }}>
        <ResponsiveContainer
          height="100%"
          minHeight={180}
          minWidth={0}
          width="100%"
        >
          <LineChart
            data={data}
            margin={{ bottom: 4, left: -14, right: 10, top: 10 }}
          >
            <CartesianGrid
              stroke={theme.palette.divider}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="event"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={domain}
              fontSize={10}
              tickFormatter={formatPrice}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value) => [formatPrice(Number(value)), "Price"]}
            />
            <ReferenceLine
              label={{
                fill: theme.palette.text.secondary,
                fontSize: 10,
                position: "insideTopRight",
                value: "Avg " + formatPrice(simulation.averageEntryPrice),
              }}
              stroke={theme.palette.warning.main}
              strokeDasharray="4 4"
              y={simulation.averageEntryPrice}
            />
            <Line
              activeDot={{ r: 5 }}
              dataKey="price"
              dot={{ fill: theme.palette.primary.main, r: 4 }}
              isAnimationActive={false}
              stroke={theme.palette.primary.main}
              strokeWidth={2}
              type="linear"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Box
        sx={{
          columnGap: 1,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          mt: 0.75,
        }}
      >
        <SimulationPoint
          detail={"Price " + formatPrice(simulation.entryPrice)}
          point="A"
          title="BOTTOM L1"
        />
        <SimulationPoint
          detail={
            "-" +
            formatPct(simulation.maxAdversePct!) +
            " · AVG " +
            simulation.reserveMultiplier +
            "x"
          }
          point="B"
          title="BOTTOM L2"
        />
        <SimulationPoint
          detail={"+" + formatPct(simulation.targetMovePct) + " from B"}
          point="C"
          title="TOP L0"
        />
      </Box>
    </Box>
  );
}
