"use client";

import {
  Box,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import PositionLevelSequence, {
  type PositionLevelSequenceItem,
} from "@/components/LiveDashboard/Shared/PositionLevelSequence";
import type {
  BlackSwanSavingsBacktestResult,
  BlackSwanSavingsPositionResult,
} from "@/lib/devBacktest/black-swan";
import BlackSwanKlineChart, {
  type BlackSwanKlineMarker,
} from "./BlackSwanKlineChart";

function formatUsdt(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatSignedUsdt(value: number): string {
  return `${value > 0 ? "+" : ""}${formatUsdt(value)}`;
}

function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function PositionPnlOutcome({
  label,
  pnlPct,
  pnlUsdt,
}: {
  label: string;
  pnlPct: number;
  pnlUsdt: number;
}) {
  const color =
    pnlUsdt > 0
      ? "success.main"
      : pnlUsdt < 0
        ? "error.main"
        : "text.secondary";

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        minWidth: 0,
        px: 1.25,
        py: 1,
      }}
    >
      <Typography color="text.secondary" display="block" variant="caption">
        {label}
      </Typography>
      <Typography color={color} fontWeight={800} variant="body2">
        {formatSignedUsdt(pnlUsdt)} · {formatSignedPct(pnlPct)}
      </Typography>
    </Box>
  );
}

/** Builds the shared level chips from the real backtest entry and adds. */
function buildLevelSequence(
  position: BlackSwanSavingsPositionResult,
): PositionLevelSequenceItem[] {
  const hasAveraging = position.averagingExecutions.length > 0;
  return [
    {
      coveredMarginUsdt: 0,
      isAveraged: false,
      isEntry: true,
      level: position.entryLevel,
      state: hasAveraging ? "passed" : "current",
    },
    ...position.averagingExecutions.map((execution, index) => ({
      averagingMultiplier: execution.multiplier,
      coveredMarginUsdt: 0,
      isAveraged: true,
      isEntry: false,
      level: execution.level,
      marginUsdt: execution.marginUsdt,
      reserveStatus: "USED" as const,
      state:
        index === position.averagingExecutions.length - 1
          ? ("current" as const)
          : ("passed" as const),
    })),
  ];
}

function describeLevelPath(position: BlackSwanSavingsPositionResult): string {
  const levels = [
    `level ${position.entryLevel}`,
    ...position.averagingExecutions.map(
      (execution) => `level ${execution.level} averaged`,
    ),
  ];
  return levels.join(" → ");
}

function vPointMarkerText(
  point: BlackSwanSavingsPositionResult["vPoints"][number],
): string {
  const pct = Number.isFinite(point.pct) ? point.pct?.toFixed(2) : "—";
  const shortId = point.id.split("_")[1] || point.id;
  return `${point.l}[${point.lvl}] ${pct}% - ${shortId}`;
}

function positionMarkers(
  position: BlackSwanSavingsPositionResult,
  crisisT: number | undefined,
  colors: {
    average: string;
    bottom: string;
    entry: string;
    exit: string;
    protection: string;
    top: string;
  },
): BlackSwanKlineMarker[] {
  const exitsAtCrisis = crisisT === position.protectedExitT;
  return [
    ...position.vPoints.map((point): BlackSwanKlineMarker => ({
      color: point.l === "T" ? colors.top : colors.bottom,
      position: point.l === "T" ? "aboveBar" : "belowBar",
      shape: "circle",
      t: point.t,
      text: vPointMarkerText(point),
    })),
    {
      color: colors.entry,
      position: "belowBar",
      shape: "arrowUp",
      t: position.entryT,
      text: `ENTRY L${position.entryLevel}`,
    },
    ...position.averagingExecutions.map((execution): BlackSwanKlineMarker => ({
      color: colors.average,
      position: "belowBar",
      shape: "circle",
      t: execution.t,
      text: `AVG L${execution.level}`,
    })),
    ...(crisisT && !exitsAtCrisis
      ? [
          {
            color: colors.protection,
            position: "aboveBar" as const,
            shape: "square" as const,
            t: crisisT,
            text: "PROTECTION START (CRISIS)",
          },
        ]
      : []),
    {
      color: colors.exit,
      position: "aboveBar",
      shape: "arrowDown",
      t: position.protectedExitT,
      text: exitsAtCrisis
        ? `PROTECTION START → ${position.protectedExitReason} EXIT`
        : `${position.protectedExitReason} EXIT`,
    },
  ];
}

export default function BlackSwanPositionScenarios({
  result,
}: {
  result: BlackSwanSavingsBacktestResult;
}) {
  const theme = useTheme();
  const crisisT = result.transitions.find(
    (transition) => transition.to === "CRISIS",
  )?.t;

  return (
    <Stack spacing={1.5}>
      <Typography fontWeight={800} variant="subtitle1">
        BTC and live-like position replays
      </Typography>
      <Typography color="text.secondary" variant="caption">
        T/B circles remain at their generated 5-minute pivot timestamps. A
        vPoint becomes actionable only later, after its 1% confirmation
        reversal; AVG markers use that later executable 1-minute price. Dashed
        price lines show the weighted entry before the earliest actual exit.
      </Typography>

      <Paper component="section" variant="outlined" sx={{ p: 1.5 }}>
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 1 }}
        >
          <Box>
            <Typography fontWeight={800}>BTC</Typography>
            <Typography color="text.secondary" variant="caption">
              Market-wide detector reference
            </Typography>
          </Box>
          <Chip label="Detector" size="small" variant="outlined" />
        </Stack>
        <BlackSwanKlineChart
          candles={result.klinesBySymbol.BTC ?? []}
          label="BTC candlestick chart for the selected Black Swan scenario"
          markers={
            crisisT
              ? [
                  {
                    color: theme.palette.error.main,
                    position: "aboveBar",
                    shape: "arrowDown",
                    t: crisisT,
                    text: "CRISIS",
                  },
                ]
              : []
          }
        />
      </Paper>

      {result.positions.map((position) => (
        <Paper
          component="section"
          key={position.symbol}
          variant="outlined"
          sx={{ p: 1.5 }}
        >
          <Stack spacing={1.25}>
            <Stack
              alignItems={{ xs: "flex-start", sm: "center" }}
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              spacing={1}
            >
              <Box>
                <Typography fontWeight={800}>{position.symbol}</Typography>
                <Typography color="text.secondary" variant="caption">
                  {position.direction} · {describeLevelPath(position)}
                </Typography>
              </Box>
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                <Tooltip
                  arrow
                  title={`${position.monitoringReasonAtExit}. This is classification at the actual exit using the current Runtime rules; the replay itself evaluates every closed 1-minute candle.`}
                >
                  <Chip
                    color={
                      position.monitoringStageAtExit === "speedup"
                        ? "warning"
                        : "default"
                    }
                    label={`${position.monitoringStageAtExit.toUpperCase()} at exit`}
                    size="small"
                    variant="outlined"
                  />
                </Tooltip>
                <Chip
                  label={`${formatUsdt(position.totalMarginUsdt)} active margin`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={`${formatUsdt(position.totalNotionalUsdt)} active notional`}
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </Stack>

            <PositionLevelSequence
              items={buildLevelSequence(position)}
              reserveMultiplier={
                position.averagingExecutions[0]?.multiplier ?? 2
              }
              showTargetAlert={false}
            />

            <Box sx={{ maxWidth: { sm: 360 } }}>
              <PositionPnlOutcome
                label="Actual exit PnL with current Black Swan config"
                pnlPct={position.protectedPnlPct}
                pnlUsdt={position.protectedPnlUsdt}
              />
            </Box>

            <BlackSwanKlineChart
              averageEntryPrice={position.averageEntryPrice}
              candles={result.klinesBySymbol[position.symbol] ?? []}
              label={`${position.symbol} candlestick chart with simulated entry and averaging markers`}
              markers={positionMarkers(position, crisisT, {
                average: theme.palette.warning.main,
                bottom: theme.palette.success.main,
                entry: theme.palette.info.main,
                exit: theme.palette.error.main,
                protection: theme.palette.warning.dark,
                top: theme.palette.error.light,
              })}
            />
            <Typography color="text.secondary" variant="caption">
              Actual exit: {position.protectedExitReason} at{" "}
              {formatUsdt(position.protectedExitPrice)}. Chart window contains{" "}
              {position.vPoints.length} vPoints from five before entry through
              five after the later of CRISIS or actual exit (when available).
            </Typography>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
