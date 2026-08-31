"use client";

import { Box, Grid, Typography } from "@mui/material";
import { useMemo } from "react";
import { RangedValueChip, type RangedValueColorRange } from "./RangedValueText";
import type { SlowTradingReportRow } from "./types";
import { formatHoldMs } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const POSITIVE_NEGATIVE_RANGES: RangedValueColorRange[] = [
  { color: "error.main", max: 0 },
  { color: "success.main", min: 0, minInclusive: false },
];
const WIN_RATE_RANGES: RangedValueColorRange[] = [
  { color: "error.main", max: 45 },
  { color: "warning.main", max: 60, min: 45 },
  { color: "success.main", min: 60 },
];
const HOLD_DURATION_RANGES: RangedValueColorRange[] = [
  { color: "success.main", max: DAY_MS },
  { color: "warning.main", max: DAY_MS * 2, maxInclusive: true, min: DAY_MS },
  { color: "error.main", min: DAY_MS * 2, minInclusive: false },
];
const DRAWDOWN_RANGES: RangedValueColorRange[] = [
  { color: "error.main", max: -20, maxInclusive: true },
  { color: "warning.main", max: -5, min: -20, minInclusive: false },
  { color: "success.main", min: -5 },
];
const WIN_COUNT_RANGES: RangedValueColorRange[] = [
  { color: "success.main", min: 1 },
];
const LOSS_COUNT_RANGES: RangedValueColorRange[] = [
  { color: "error.main", min: 1 },
];
const TRADE_COUNT_RANGES: RangedValueColorRange[] = [
  { color: "primary.main", min: 1 },
];

export function SummarySection({
  history,
  startingBalanceUSDT,
}: {
  history: SlowTradingReportRow[];
  startingBalanceUSDT: number;
}) {
  const summary = useMemo(() => {
    const totalTrades = history.length;
    const totalProfit = history.reduce((acc, item) => acc + (item.pnl.netUsdt || 0), 0);
    const winCount = history.filter((item) => (item.pnl.netUsdt || 0) > 0).length;
    const lossCount = history.filter((item) => (item.pnl.netUsdt || 0) < 0).length;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const cumulativePnlPercent =
      startingBalanceUSDT > 0 ? (totalProfit / startingBalanceUSDT) * 100 : 0;

    const drawdowns = history
      .map((item) => item.pnl.maxDownPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const runups = history
      .map((item) => item.pnl.maxUpPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const holds = history
      .map((item) => (item.closed?.t ?? NaN) - item.opened.t)
      .filter((value): value is number => Number.isFinite(value) && value > 0);
    const pnlUsdts = history
      .map((item) => item.pnl.netUsdt)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const pnlPcts = history
      .map((item) => item.pnl.netPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    return {
      totalTrades,
      totalProfit,
      winCount,
      lossCount,
      winRate,
      cumulativePnlPercent,
      drawdown: {
        min: drawdowns.length ? Math.min(...drawdowns) : null,
        avg: drawdowns.length ? drawdowns.reduce((acc, value) => acc + value, 0) / drawdowns.length : null,
        max: drawdowns.length ? Math.max(...drawdowns) : null,
      },
      runup: {
        min: runups.length ? Math.min(...runups) : null,
        avg: runups.length ? runups.reduce((acc, value) => acc + value, 0) / runups.length : null,
        max: runups.length ? Math.max(...runups) : null,
      },
      hold: {
        min: holds.length ? Math.min(...holds) : null,
        avg: holds.length ? holds.reduce((acc, value) => acc + value, 0) / holds.length : null,
        max: holds.length ? Math.max(...holds) : null,
      },
      pnlUsdt: {
        min: pnlUsdts.length ? Math.min(...pnlUsdts) : null,
        avg: pnlUsdts.length ? pnlUsdts.reduce((acc, value) => acc + value, 0) / pnlUsdts.length : null,
        max: pnlUsdts.length ? Math.max(...pnlUsdts) : null,
      },
      pnlPct: {
        min: pnlPcts.length ? Math.min(...pnlPcts) : null,
        avg: pnlPcts.length ? pnlPcts.reduce((acc, value) => acc + value, 0) / pnlPcts.length : null,
        max: pnlPcts.length ? Math.max(...pnlPcts) : null,
      },
    };
  }, [history, startingBalanceUSDT]);

  const formatPct = (value: number | null | undefined) =>
    value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  const formatUsdt = (value: number | null | undefined) =>
    value == null ? "—" : `$${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  const formatCount = (value: number | null | undefined) =>
    value == null ? "—" : value.toLocaleString();

  return (
    <Box sx={{ mb: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="body1" color="text.secondary">
            Performance
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            <RangedValueChip
              formatValue={formatUsdt}
              label="Net"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.totalProfit}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Cum PnL"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.cumulativePnlPercent}
            />
            <RangedValueChip
              formatValue={(value) =>
                value == null ? "—" : `${value.toFixed(1)}%`
              }
              label="Win rate"
              ranges={WIN_RATE_RANGES}
              value={summary.winRate}
            />
            <RangedValueChip
              formatValue={formatCount}
              label="Trades"
              ranges={TRADE_COUNT_RANGES}
              value={summary.totalTrades}
            />
            <RangedValueChip
              fallbackColor="text.secondary"
              formatValue={formatCount}
              label="Wins"
              ranges={WIN_COUNT_RANGES}
              value={summary.winCount}
            />
            <RangedValueChip
              fallbackColor="success.main"
              formatValue={formatCount}
              label="Losses"
              ranges={LOSS_COUNT_RANGES}
              value={summary.lossCount}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="body1" color="text.secondary">
            Hold Time
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            <RangedValueChip
              formatValue={formatHoldMs}
              label="Min"
              ranges={HOLD_DURATION_RANGES}
              value={summary.hold.min}
            />
            <RangedValueChip
              formatValue={formatHoldMs}
              label="Avg"
              ranges={HOLD_DURATION_RANGES}
              value={summary.hold.avg}
            />
            <RangedValueChip
              formatValue={formatHoldMs}
              label="Max"
              ranges={HOLD_DURATION_RANGES}
              value={summary.hold.max}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="body1" color="text.secondary">
            PnL Distribution
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            <RangedValueChip
              formatValue={formatUsdt}
              label="Min"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlUsdt.min}
            />
            <RangedValueChip
              formatValue={formatUsdt}
              label="Avg"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlUsdt.avg}
            />
            <RangedValueChip
              formatValue={formatUsdt}
              label="Max"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlUsdt.max}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Min"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlPct.min}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Avg"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlPct.avg}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Max"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.pnlPct.max}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Typography variant="body1" color="text.secondary">
            Drawdown
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            <RangedValueChip
              formatValue={formatPct}
              label="DD Min"
              ranges={DRAWDOWN_RANGES}
              value={summary.drawdown.min}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="DD Avg"
              ranges={DRAWDOWN_RANGES}
              value={summary.drawdown.avg}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="DD Max"
              ranges={DRAWDOWN_RANGES}
              value={summary.drawdown.max}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Run-up Min"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.runup.min}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Run-up Avg"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.runup.avg}
            />
            <RangedValueChip
              formatValue={formatPct}
              label="Run-up Max"
              ranges={POSITIVE_NEGATIVE_RANGES}
              value={summary.runup.max}
            />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
