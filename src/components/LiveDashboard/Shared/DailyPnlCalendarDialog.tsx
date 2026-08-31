"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { alpha, lighten } from "@mui/material/styles";
import {
  Box,
  Chip,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Position } from "@/lib/trading/models";
import slowTradingDailyPerformance from "@/lib/slowTrading/daily-performance";
import { type ReactNode, useMemo, useState } from "react";

export type DailyPnlCalendarTrade = {
  entryTime: number;
  exitTime?: number;
  netPnlPct?: number;
  netProfitUSDT?: number;
};

export type DailyPnlCalendarBalanceSnapshot = {
  day: string;
  timestamp: number;
  total: number;
};

/** Adapts canonical persisted position data to the calendar's compact input. */
export function toDailyPnlCalendarTrade(
  position: Pick<Position, "opened" | "closed" | "pnl">,
): DailyPnlCalendarTrade {
  return {
    entryTime: position.opened.t,
    exitTime: position.closed?.t,
    netPnlPct: position.pnl.netPct,
    netProfitUSDT: position.pnl.netUsdt,
  };
}

type DailyCalendarCell = {
  day: string;
  dayOfMonth: number;
  tradePnlUsdt: number;
  tradePnlPercent: number;
  balancePnlUsdt: number | null;
  balancePnlPercentOfStart: number | null;
  startBalance: number | null;
  endBalance: number | null;
  trades: number;
  wins: number;
  winRate: number;
  monthlyPnlShare: number;
};

type MonthSection = {
  monthKey: string;
  title: string;
  cells: Array<DailyCalendarCell | null>;
  tradeSharpe: number | null;
};

type MonthProjection = {
  averageTradePnlPerDay: number;
  daysInMonth: number;
  estimatedEndBalance: number | null;
  estimatedMonthTradePnlUsdt: number;
  estimatedMonthTradePnlPercentOfStart: number | null;
  observedDays: number;
  observedTradePnlUsdt: number;
  observedTrades: number;
  tradePerDay: number;
  startBalance: number | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toUtcDayKey(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * Reconstructs one running balance snapshot per UTC day from closed-trade PnL.
 */
export function buildTradePnlBalanceSnapshots({
  history,
  startingBalanceUSDT,
}: {
  history: DailyPnlCalendarTrade[];
  startingBalanceUSDT: number;
}): DailyPnlCalendarBalanceSnapshot[] {
  const closedTrades = history
    .map((trade) => ({
      closedAt: trade.exitTime ?? trade.entryTime,
      pnlUsdt:
        typeof trade.netProfitUSDT === "number" &&
        Number.isFinite(trade.netProfitUSDT)
          ? trade.netProfitUSDT
          : 0,
    }))
    .filter(
      (trade): trade is { closedAt: number; pnlUsdt: number } =>
        Number.isFinite(trade.closedAt) && trade.closedAt > 0,
    )
    .sort((left, right) => left.closedAt - right.closedAt);

  if (closedTrades.length === 0) {
    return [];
  }

  const dailyPnl = new Map<string, number>();
  for (const trade of closedTrades) {
    const day = toUtcDayKey(trade.closedAt);
    dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + trade.pnlUsdt);
  }

  const firstDay = parseUtcDayKey(toUtcDayKey(closedTrades[0].closedAt));
  const lastDay = parseUtcDayKey(
    toUtcDayKey(closedTrades[closedTrades.length - 1].closedAt),
  );
  const snapshots: DailyPnlCalendarBalanceSnapshot[] = [];
  let balance = Number.isFinite(startingBalanceUSDT)
    ? startingBalanceUSDT
    : 0;

  for (
    const cursor = new Date(firstDay);
    cursor.getTime() <= lastDay.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.toISOString().slice(0, 10);
    balance += dailyPnl.get(day) ?? 0;
    snapshots.push({
      day,
      timestamp: cursor.getTime(),
      total: balance,
    });
  }

  return snapshots;
}

function parseUtcDayKey(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function formatMonthTitle(day: string): string {
  return parseUtcDayKey(day).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatSignedUsdt(value: number): string {
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
}

function formatSignedPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Formats a currency value to fit inside a narrow mobile calendar cell. */
function formatCompactSignedUsdt(value: number): string {
  const absoluteValue = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const scale = absoluteValue >= 1_000_000
    ? { divisor: 1_000_000, suffix: "m" }
    : absoluteValue >= 1_000
      ? { divisor: 1_000, suffix: "k" }
      : { divisor: 1, suffix: "" };
  const scaledValue = absoluteValue / scale.divisor;
  const maximumDecimals = scale.divisor > 1
    ? 1
    : absoluteValue >= 100
      ? 0
      : absoluteValue >= 10
        ? 1
        : 2;
  const formattedValue = Number(scaledValue.toFixed(maximumDecimals)).toString();

  return `${sign}$${formattedValue}${scale.suffix}`;
}

/** Formats a percentage with only the precision useful in a mobile cell. */
function formatCompactSignedPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const absoluteValue = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const maximumDecimals = absoluteValue >= 100 ? 0 : 1;
  const formattedValue = Number(absoluteValue.toFixed(maximumDecimals)).toString();

  return `${sign}${formattedValue}%`;
}

function formatWinRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatSharpe(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(2);
}

/** Maps Trade Sharpe to its conventional qualitative color band. */
export function getTradeSharpeColor(
  value: number | null,
): "default" | "error" | "warning" | "success" {
  if (value === null) return "default";
  if (value < 1) return "error";
  return value < 2 ? "warning" : "success";
}

// BOTH:MONTHLY_TRADE_SHARPE
/** Calculates unannualized Sharpe from daily closed-trade return percentages. */
export function calculateMonthlyTradeSharpe(
  dailyTradeReturns: number[],
): number | null {
  const returns = dailyTradeReturns.filter(Number.isFinite);
  if (returns.length < 2) {
    return null;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    returns.length;
  const standardDeviation = Math.sqrt(variance);

  return standardDeviation > 0 ? mean / standardDeviation : null;
}

/** Returns the semantic text color for a daily win rate. */
export function getDailyWinRateColor(
  winRate: number,
): "error.main" | "warning.main" | "success.main" {
  if (winRate < 70) {
    return "error.main";
  }

  return winRate < 90 ? "warning.main" : "success.main";
}

/** Maps a day's monthly PnL contribution to a visible calendar tint. */
function getDailyPnlTintOpacity(monthlyPnlShare: number): number {
  const normalizedShare = Math.min(1, Math.max(0, monthlyPnlShare));

  return 0.08 + Math.sqrt(normalizedShare) * 0.5;
}

function WinRateBadge({
  compact = false,
  winRate,
}: {
  compact?: boolean;
  winRate: number;
}) {
  return (
    <Box
      component="span"
      sx={{
        px: compact ? 0.25 : 0.375,
        borderRadius: 0.5,
        backgroundColor: "common.white",
        color: getDailyWinRateColor(winRate),
        fontWeight: 700,
      }}
    >
      {compact
        ? formatCompactSignedPercent(winRate).replace("+", "")
        : formatWinRate(winRate)}
    </Box>
  );
}

function getDaysInUtcMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 0;
  }

  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatUsdt(value: number | null): string {
  return value !== null ? `$${value.toFixed(2)}` : "—";
}

function metricTooltip(title: string, lines: string[]) {
  return (
    <Box>
      <Typography component="div" sx={{ fontSize: "0.8rem", fontWeight: 700 }}>
        {title}
      </Typography>
      {lines.map((line) => (
        <Typography key={line} component="div" sx={{ fontSize: "0.75rem" }}>
          {line}
        </Typography>
      ))}
    </Box>
  );
}

function buildMetricTooltips(cell: DailyCalendarCell) {
  const tradeValue =
    cell.trades > 0 ? formatSignedUsdt(cell.tradePnlUsdt) : "$0.00";
  const balanceValue =
    cell.balancePnlUsdt !== null ? formatSignedUsdt(cell.balancePnlUsdt) : "—";
  const startValue = formatUsdt(cell.startBalance);
  const endValue = formatUsdt(cell.endBalance);
  const balanceFormula =
    cell.balancePnlUsdt !== null &&
    cell.startBalance !== null &&
    cell.endBalance !== null
      ? `${balanceValue} = ${endValue} - ${startValue}`
      : "Needs both a start balance and an end balance snapshot.";
  const balancePnlFormula =
    cell.balancePnlPercentOfStart !== null &&
    cell.balancePnlUsdt !== null &&
    cell.startBalance !== null
      ? `${formatSignedPercent(cell.balancePnlPercentOfStart)} = (${balanceValue} / ${startValue}) * 100`
      : "Needs Balance Δ and a non-zero start balance.";

  return {
    trade: metricTooltip("Trade PnL", [
      `Sum of netProfitUSDT from closed trades on ${cell.day}.`,
      `Closed trade count: ${cell.trades}.`,
      `Result: ${tradeValue}.`,
    ]),
    tradePnlPercent: metricTooltip("Trade PnL %", [
      `Sum of position.pnl.netPct from closed trades on ${cell.day}.`,
      `Result: ${formatSignedPercent(cell.tradePnlPercent)}.`,
    ]),
    winRate: metricTooltip("Win rate", [
      "A win is a closed trade with positive net PnL.",
      "Formula: wins / closed trades * 100.",
      `Result: ${cell.wins} / ${cell.trades} = ${formatWinRate(cell.winRate)}.`,
    ]),
    balance: metricTooltip("Balance Δ", [
      "Calculated from balance_snapshots.json.",
      "Formula: end balance - start balance.",
      balanceFormula,
    ]),
    balancePnl: metricTooltip("Balance PnL %", [
      "Calculated from Balance Δ and start balance.",
      "Formula: (Balance Δ / Start) * 100.",
      balancePnlFormula,
    ]),
    trades: metricTooltip("Trades", [
      "Count of closed trade history records for this UTC day.",
      "A trade is grouped by exitTime, falling back to entryTime.",
      `Result: ${cell.trades} trade${cell.trades === 1 ? "" : "s"}.`,
    ]),
    start: metricTooltip("Start Balance", [
      "Start is the previous running end balance.",
      "The first available day uses startingBalanceUSDT when provided.",
      `Result: ${startValue}.`,
    ]),
    end: metricTooltip("End Balance", [
      "End is the day's total from balance_snapshots.json.",
      "Missing snapshot means no end balance for that day.",
      `Result: ${endValue}.`,
    ]),
  };
}

function TooltipText(props: {
  children: ReactNode;
  title: ReactNode;
}) {
  const { children, title } = props;

  return (
    <Tooltip arrow placement="top" title={title}>
      <Box component="span" sx={{ cursor: "help" }}>
        {children}
      </Box>
    </Tooltip>
  );
}

function TooltipChip(props: {
  children: ReactNode;
  title: ReactNode;
}) {
  const { children, title } = props;

  return (
    <Tooltip arrow placement="top" title={title}>
      <Box component="span" sx={{ display: "inline-flex", maxWidth: "100%" }}>
        {children}
      </Box>
    </Tooltip>
  );
}

function buildHeaderTooltips(params: {
  bestDay: DailyCalendarCell | null;
  monthProjection: MonthProjection | null;
  selectedMonthTitle: string;
  totalBalancePnlUsdt: number | null;
  totalPnlUsdt: number;
  totalTrades: number;
  worstDay: DailyCalendarCell | null;
}) {
  const {
    bestDay,
    monthProjection,
    selectedMonthTitle,
    totalBalancePnlUsdt,
    totalPnlUsdt,
    totalTrades,
    worstDay,
  } = params;

  return {
    tradeTotal: metricTooltip("Trade Total", [
      "Sum of daily Trade PnL for days that have closed trades.",
      "Each day sums closed trade history netProfitUSDT.",
      `Result: ${formatSignedUsdt(totalPnlUsdt)}.`,
    ]),
    balanceTotal: metricTooltip("Balance Δ Total", [
      "Uses balance snapshots across the visible history range.",
      "Formula: latest ending balance - startingBalanceUSDT.",
      totalBalancePnlUsdt !== null
        ? `Result: ${formatSignedUsdt(totalBalancePnlUsdt)}.`
        : "Needs startingBalanceUSDT and at least one ending balance snapshot.",
    ]),
    trades: metricTooltip("Trades", [
      "Total closed trade history records in the calendar range.",
      "Each trade is grouped by exitTime, falling back to entryTime.",
      `Result: ${totalTrades} trade${totalTrades === 1 ? "" : "s"}.`,
    ]),
    bestDay: metricTooltip("Best Day", [
      "Day with the highest daily Trade PnL.",
      "Only days with at least one closed trade are considered.",
      bestDay
        ? `Result: ${bestDay.day} at ${formatSignedUsdt(bestDay.tradePnlUsdt)}.`
        : "No closed trade days available.",
    ]),
    worstDay: metricTooltip("Worst Day", [
      "Day with the lowest daily Trade PnL.",
      "Only days with at least one closed trade are considered.",
      worstDay
        ? `Result: ${worstDay.day} at ${formatSignedUsdt(worstDay.tradePnlUsdt)}.`
        : "No closed trade days available.",
    ]),
    avgProfitPerDay: metricTooltip("Avg Profit / Day", [
      `Calculated for ${selectedMonthTitle}.`,
      "Formula: observed month Trade PnL / observed calendar days.",
      monthProjection
        ? `${formatSignedUsdt(monthProjection.averageTradePnlPerDay)} = ${formatSignedUsdt(monthProjection.observedTradePnlUsdt)} / ${monthProjection.observedDays} days.`
        : "Needs at least one observed day in the selected month.",
      monthProjection
        ? `Trade pace: ${monthProjection.tradePerDay.toFixed(2)} trades/day from ${monthProjection.observedTrades} trades.`
        : "Trade pace needs observed trades.",
    ]),
    estimatedMonthProfit: metricTooltip("Estimated Month-End Profit", [
      `Projection for ${selectedMonthTitle}.`,
      "Formula: Avg Profit / Day * days in month.",
      monthProjection
        ? `${formatSignedUsdt(monthProjection.estimatedMonthTradePnlUsdt)} = ${formatSignedUsdt(monthProjection.averageTradePnlPerDay)} * ${monthProjection.daysInMonth} days.`
        : "Needs an average profit/day for the selected month.",
      monthProjection &&
        monthProjection.estimatedMonthTradePnlPercentOfStart !== null
        ? `Balance gain estimate: ${formatSignedPercent(monthProjection.estimatedMonthTradePnlPercentOfStart)} of ${formatUsdt(monthProjection.startBalance)} start balance.`
        : "Balance gain estimate needs a start balance.",
      monthProjection && monthProjection.estimatedEndBalance !== null
        ? `Estimated end balance: ${formatUsdt(monthProjection.estimatedEndBalance)} = ${formatUsdt(monthProjection.startBalance)} + ${formatSignedUsdt(monthProjection.estimatedMonthTradePnlUsdt)}.`
        : "Estimated end balance needs a start balance.",
    ]),
  };
}

function buildMonthTradeSharpeTooltip(month: MonthSection) {
  const observedCells = month.cells.filter(
    (cell): cell is DailyCalendarCell => cell !== null,
  );

  return metricTooltip("Monthly Trade Sharpe", [
    "Uses only fee-aware closed-trade position.pnl.netPct values.",
    "Each UTC day is one observation; days without closed trades contribute 0%.",
    "Formula: mean daily trade return / population standard deviation.",
    "Risk-free rate: 0%. This value is not annualized.",
    `Observed days: ${observedCells.length}. Result: ${formatSharpe(month.tradeSharpe)}.`,
  ]);
}

export function buildMonthProjection(month: MonthSection): MonthProjection | null {
  const cells = month.cells.filter((cell): cell is DailyCalendarCell => Boolean(cell));
  const observedDays = Math.max(
    0,
    ...cells.map((cell) => cell.dayOfMonth),
  );
  const daysInMonth = getDaysInUtcMonth(month.monthKey);

  if (observedDays <= 0 || daysInMonth <= 0) {
    return null;
  }

  const observedTradePnlUsdt = cells.reduce(
    (sum, cell) => sum + cell.tradePnlUsdt,
    0,
  );
  const observedTrades = cells.reduce((sum, cell) => sum + cell.trades, 0);
  const averageTradePnlPerDay = observedTradePnlUsdt / observedDays;
  const estimatedMonthTradePnlUsdt = averageTradePnlPerDay * daysInMonth;
  const startBalance =
    cells.find((cell) => isFiniteNumber(cell.startBalance))?.startBalance ??
    null;
  const estimatedMonthTradePnlPercentOfStart =
    startBalance !== null && Math.abs(startBalance) > 0.000001
      ? (estimatedMonthTradePnlUsdt / startBalance) * 100
      : null;
  const estimatedEndBalance =
    startBalance !== null ? startBalance + estimatedMonthTradePnlUsdt : null;

  return {
    averageTradePnlPerDay,
    daysInMonth,
    estimatedEndBalance,
    estimatedMonthTradePnlUsdt,
    estimatedMonthTradePnlPercentOfStart,
    observedDays,
    observedTradePnlUsdt,
    observedTrades,
    tradePerDay: observedTrades / observedDays,
    startBalance,
  };
}

export function buildDailyCalendarData(
  history: DailyPnlCalendarTrade[],
  balanceSnapshots: DailyPnlCalendarBalanceSnapshot[],
  startingBalanceUSDT?: number,
): {
  months: MonthSection[];
  totalPnlUsdt: number;
  totalBalancePnlUsdt: number | null;
  totalTrades: number;
  bestDay: DailyCalendarCell | null;
  worstDay: DailyCalendarCell | null;
} {
  const tradeMap =
    slowTradingDailyPerformance.trades.summarizeByUtcDay(history);

  const snapshotMap = new Map(balanceSnapshots.map((snapshot) => [snapshot.day, snapshot]));
  const allKeys = [...new Set([...tradeMap.keys(), ...snapshotMap.keys()])].sort();

  if (allKeys.length === 0) {
    return {
      months: [],
      totalPnlUsdt: 0,
      totalBalancePnlUsdt: null,
      totalTrades: 0,
      bestDay: null,
      worstDay: null,
    };
  }

  const firstDay = parseUtcDayKey(allKeys[0]);
  const lastDay = parseUtcDayKey(allKeys[allKeys.length - 1]);
  const cellsByDay = new Map<string, DailyCalendarCell>();
  let runningEndBalance: number | null = isFiniteNumber(startingBalanceUSDT)
    ? startingBalanceUSDT
    : null;
  const finalDay = new Date(
    Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()),
  );

  for (
    const cursor = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1));
    cursor.getTime() <= finalDay.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.toISOString().slice(0, 10);
    const trade = tradeMap.get(day);
    const snapshot = snapshotMap.get(day);
    const tradePnlUsdt = trade?.pnlUsdt ?? 0;
    const tradePnlPercent = trade?.pnlPercent ?? 0;
    const trades = trade?.trades ?? 0;
    const wins = trade?.wins ?? 0;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const snapshotTotal =
      typeof snapshot?.total === "number" && Number.isFinite(snapshot.total)
        ? snapshot.total
        : null;

    const startBalance: number | null =
      runningEndBalance !== null
        ? runningEndBalance
        : snapshotTotal !== null
          ? snapshotTotal
          : null;
    const balancePnlUsdt =
      snapshotTotal !== null && startBalance !== null
        ? snapshotTotal - startBalance
        : null;
    const endBalance: number | null =
      snapshotTotal !== null ? snapshotTotal : null;
    const balancePnlPercentOfStart =
      startBalance !== null &&
      balancePnlUsdt !== null &&
      Math.abs(startBalance) > 0.000001
        ? (balancePnlUsdt / startBalance) * 100
        : null;

    if (endBalance !== null) {
      runningEndBalance = endBalance;
    }

    cellsByDay.set(day, {
      day,
      dayOfMonth: cursor.getUTCDate(),
      tradePnlUsdt,
      tradePnlPercent,
      balancePnlUsdt,
      balancePnlPercentOfStart,
      startBalance,
      endBalance,
      trades,
      wins,
      winRate,
      monthlyPnlShare: 0,
    });
  }

  const monthSections: MonthSection[] = [];
  const monthCursor = new Date(
    Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1),
  );
  const lastMonthCursor = new Date(
    Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), 1),
  );

  while (monthCursor.getTime() <= lastMonthCursor.getTime()) {
    const year = monthCursor.getUTCFullYear();
    const month = monthCursor.getUTCMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const lastOfMonth = new Date(Date.UTC(year, month + 1, 0));
    const monthCells: DailyCalendarCell[] = [];

    for (let day = 1; day <= lastOfMonth.getUTCDate(); day += 1) {
      const dayKey = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
      const cell = cellsByDay.get(dayKey);

      if (cell) {
        monthCells.push(cell);
      }
    }

    const monthlyProfitUsdt = monthCells.reduce(
      (sum, cell) => sum + Math.max(0, cell.tradePnlUsdt),
      0,
    );
    const monthlyLossUsdt = monthCells.reduce(
      (sum, cell) => sum + Math.abs(Math.min(0, cell.tradePnlUsdt)),
      0,
    );
    const cells: Array<DailyCalendarCell | null> = [];

    for (let i = 0; i < firstOfMonth.getUTCDay(); i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= lastOfMonth.getUTCDate(); day += 1) {
      const dayKey = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
      const cell = cellsByDay.get(dayKey);

      if (!cell) {
        cells.push(null);
        continue;
      }

      const monthlyPnlTotal =
        cell.tradePnlUsdt > 0 ? monthlyProfitUsdt : monthlyLossUsdt;
      cells.push({
        ...cell,
        monthlyPnlShare:
          monthlyPnlTotal > 0
            ? Math.abs(cell.tradePnlUsdt) / monthlyPnlTotal
            : 0,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    monthSections.push({
      monthKey,
      title: formatMonthTitle(firstOfMonth.toISOString().slice(0, 10)),
      cells,
      tradeSharpe: calculateMonthlyTradeSharpe(
        monthCells.map((cell) => cell.tradePnlPercent),
      ),
    });

    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }

  monthSections.reverse();

  const populatedCells = [...cellsByDay.values()].filter((cell) => cell.trades > 0);
  const latestEndingCellWithBalance = [...cellsByDay.values()]
    .reverse()
    .find((cell) => isFiniteNumber(cell.endBalance));
  const totalPnlUsdt = populatedCells.reduce(
    (sum, cell) => sum + cell.tradePnlUsdt,
    0,
  );
  const totalBalancePnlUsdt =
    latestEndingCellWithBalance && isFiniteNumber(startingBalanceUSDT)
      ? latestEndingCellWithBalance.endBalance! - startingBalanceUSDT
      : null;
  const totalTrades = populatedCells.reduce((sum, cell) => sum + cell.trades, 0);
  const bestDay = populatedCells.reduce<DailyCalendarCell | null>(
    (best, cell) => (!best || cell.tradePnlUsdt > best.tradePnlUsdt ? cell : best),
    null,
  );
  const worstDay = populatedCells.reduce<DailyCalendarCell | null>(
    (worst, cell) =>
      !worst || cell.tradePnlUsdt < worst.tradePnlUsdt ? cell : worst,
    null,
  );

  return {
    months: monthSections,
    totalPnlUsdt,
    totalBalancePnlUsdt,
    totalTrades,
    bestDay,
    worstDay,
  };
}

export default function DailyPnlCalendarDialog({
  history,
  balanceSnapshots,
  startingBalanceUSDT,
  description,
}: {
  history: DailyPnlCalendarTrade[];
  balanceSnapshots: DailyPnlCalendarBalanceSnapshot[];
  startingBalanceUSDT?: number;
  description?: string;
}) {
  const {
    bestDay,
    months,
    totalBalancePnlUsdt,
    totalPnlUsdt,
    totalTrades,
    worstDay,
  } = useMemo(
    () => buildDailyCalendarData(history, balanceSnapshots, startingBalanceUSDT),
    [balanceSnapshots, history, startingBalanceUSDT],
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  if (months.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">
          No closed trade history or balance snapshot data yet.
        </Typography>
      </Box>
    );
  }

  const selectedMonthIndex = Math.max(
    0,
    months.findIndex((month) =>
      month.monthKey ===
      (months.some((candidate) => candidate.monthKey === selectedMonthKey)
        ? selectedMonthKey
        : months[0].monthKey),
    ),
  );
  const selectedMonth = months[selectedMonthIndex] ?? months[0];
  const monthProjection = buildMonthProjection(selectedMonth);
  const headerTooltips = buildHeaderTooltips({
    bestDay,
    monthProjection,
    selectedMonthTitle: selectedMonth.title,
    totalBalancePnlUsdt,
    totalPnlUsdt,
    totalTrades,
    worstDay,
  });

  return (
    <Box sx={{ p: { xs: 0.5, sm: 2 }, overflowX: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          gap: { xs: 0.5, sm: 1 },
          flexWrap: "wrap",
          mb: { xs: 1, sm: 2 },
          "& .MuiChip-root": { maxWidth: "100%" },
        }}
      >
        <TooltipChip title={headerTooltips.tradeTotal}>
          <Chip
            label={`Trade Total ${formatSignedUsdt(totalPnlUsdt)}`}
            color={totalPnlUsdt >= 0 ? "success" : "error"}
          />
        </TooltipChip>
        {totalBalancePnlUsdt !== null ? (
          <TooltipChip title={headerTooltips.balanceTotal}>
            <Chip
              label={`Balance Δ ${formatSignedUsdt(totalBalancePnlUsdt)}`}
              color={totalBalancePnlUsdt >= 0 ? "success" : "error"}
              variant="outlined"
            />
          </TooltipChip>
        ) : null}
        <TooltipChip title={headerTooltips.trades}>
          <Chip label={`Trades ${totalTrades}`} variant="outlined" />
        </TooltipChip>
        {monthProjection ? (
          <TooltipChip title={headerTooltips.avgProfitPerDay}>
            <Chip
              label={`Avg/day ${formatSignedUsdt(monthProjection.averageTradePnlPerDay)}`}
              color={monthProjection.averageTradePnlPerDay >= 0 ? "success" : "error"}
              variant="outlined"
            />
          </TooltipChip>
        ) : null}
        {monthProjection ? (
          <TooltipChip title={headerTooltips.estimatedMonthProfit}>
            <Chip
              label={`Est Month ${formatSignedUsdt(monthProjection.estimatedMonthTradePnlUsdt)} (${formatSignedPercent(monthProjection.estimatedMonthTradePnlPercentOfStart)}) End ${formatUsdt(monthProjection.estimatedEndBalance)}`}
              color={
                monthProjection.estimatedMonthTradePnlUsdt >= 0
                  ? "success"
                  : "error"
              }
              variant="outlined"
            />
          </TooltipChip>
        ) : null}
        {bestDay ? (
          <TooltipChip title={headerTooltips.bestDay}>
            <Chip
              label={`Best ${bestDay.day}: ${formatSignedUsdt(bestDay.tradePnlUsdt)}`}
              color="success"
              variant="outlined"
            />
          </TooltipChip>
        ) : null}
        {worstDay ? (
          <TooltipChip title={headerTooltips.worstDay}>
            <Chip
              label={`Worst ${worstDay.day}: ${formatSignedUsdt(worstDay.tradePnlUsdt)}`}
              color="error"
              variant="outlined"
            />
          </TooltipChip>
        ) : null}
      </Box>

      {description ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: { xs: 1, sm: 2 } }}
        >
          {description}
        </Typography>
      ) : null}

      <Box sx={{ mb: { xs: 1, sm: 1.5 } }}>
        <TooltipChip title={buildMonthTradeSharpeTooltip(selectedMonth)}>
          <Chip
            color={getTradeSharpeColor(selectedMonth.tradeSharpe)}
            label={`Trade Sharpe ${formatSharpe(selectedMonth.tradeSharpe)}`}
            size="small"
            variant="outlined"
          />
        </TooltipChip>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: { xs: 1, sm: 2 },
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          <IconButton
            size="small"
            onClick={() =>
              setSelectedMonthKey(
                months[selectedMonthIndex + 1]?.monthKey ?? selectedMonth.monthKey,
              )
            }
            disabled={selectedMonthIndex >= months.length - 1}
            title="Older month"
          >
            <ChevronLeftIcon />
          </IconButton>

          <Typography
            variant="h6"
            sx={{
              flex: { xs: 1, sm: "initial" },
              minWidth: { xs: 0, sm: 180 },
              textAlign: "center",
            }}
          >
            {selectedMonth.title}
          </Typography>

          <IconButton
            size="small"
            onClick={() =>
              setSelectedMonthKey(
                months[selectedMonthIndex - 1]?.monthKey ?? selectedMonth.monthKey,
              )
            }
            disabled={selectedMonthIndex <= 0}
            title="Newer month"
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>

        <Select
          size="small"
          value={selectedMonth.monthKey}
          onChange={(event) => setSelectedMonthKey(event.target.value)}
          sx={{ display: { xs: "none", sm: "inline-flex" }, minWidth: 220 }}
        >
          {months.map((month) => (
            <MenuItem key={month.monthKey} value={month.monthKey}>
              {month.title}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Grid
        container
        columns={7}
        spacing={{ xs: 0.25, sm: 1 }}
        sx={{ mb: { xs: 0.25, sm: 1 } }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Grid key={label} size={1} sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              aria-label={label}
              sx={{
                display: "block",
                textAlign: "center",
                fontWeight: 700,
                fontSize: { xs: "0.65rem", sm: "0.75rem" },
              }}
            >
              <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                {label.slice(0, 1)}
              </Box>
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {label}
              </Box>
            </Typography>
          </Grid>
        ))}
      </Grid>

      <Grid container columns={7} spacing={{ xs: 0.25, sm: 1 }}>
        {selectedMonth.cells.map((cell, index) => {
          const hasTrades = (cell?.trades ?? 0) > 0;
          const tradePnlUsdt = cell?.tradePnlUsdt ?? 0;
          const hasDirectionalPnl = hasTrades && tradePnlUsdt !== 0;
          const balancePnlUsdt = cell?.balancePnlUsdt ?? null;
          const balanceToneValue = balancePnlUsdt ?? 0;
          const tooltips = cell ? buildMetricTooltips(cell) : null;
          const dailyPnlTintOpacity = cell
            ? getDailyPnlTintOpacity(cell.monthlyPnlShare)
            : 0;

          return (
            <Grid
              key={`${selectedMonth.monthKey}-${index}`}
              size={1}
              sx={{ minWidth: 0 }}
            >
              {cell ? (
                <Paper
                  elevation={0}
                  sx={(theme) => ({
                    minHeight: { xs: 88, sm: 166 },
                    p: { xs: 0.375, sm: 1 },
                    overflow: "hidden",
                    border: `1px solid ${theme.palette.divider}`,
                    "& .MuiTypography-root": hasDirectionalPnl
                      ? { color: theme.palette.common.black }
                      : undefined,
                    backgroundColor: hasDirectionalPnl
                      ? tradePnlUsdt > 0
                        ? lighten(
                            theme.palette.success.main,
                            1 - dailyPnlTintOpacity,
                          )
                        : lighten(
                            theme.palette.error.main,
                            1 - dailyPnlTintOpacity,
                          )
                      : alpha(theme.palette.action.hover, 0.35),
                  })}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      fontWeight: 700,
                      fontSize: { xs: "0.625rem", sm: "0.75rem" },
                      lineHeight: 1.2,
                    }}
                  >
                    {cell.dayOfMonth}
                  </Typography>

                  <Box
                    sx={{
                      display: { xs: "block", sm: "none" },
                      mt: 0.375,
                      fontVariantNumeric: "tabular-nums",
                      "& .MuiTypography-root": {
                        fontSize: "clamp(0.52rem, 2.15vw, 0.65rem)",
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "clip",
                        whiteSpace: "nowrap",
                      },
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 700,
                        color: hasTrades
                          ? tradePnlUsdt >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary",
                      }}
                    >
                      <TooltipText title={tooltips?.trade}>
                        T {hasTrades ? formatCompactSignedUsdt(tradePnlUsdt) : "$0"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      color={
                        hasTrades
                          ? cell.tradePnlPercent >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                    >
                      <TooltipText title={tooltips?.tradePnlPercent}>
                        {hasTrades
                          ? formatCompactSignedPercent(cell.tradePnlPercent)
                          : "—"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      color={
                        balancePnlUsdt !== null
                          ? balanceToneValue >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                    >
                      <TooltipText title={tooltips?.balance}>
                        B {balancePnlUsdt !== null
                          ? formatCompactSignedUsdt(balancePnlUsdt)
                          : "—"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      color={
                        balancePnlUsdt !== null
                          ? balanceToneValue >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                    >
                      <TooltipText title={tooltips?.balancePnl}>
                        {formatCompactSignedPercent(cell.balancePnlPercentOfStart)}
                      </TooltipText>
                    </Typography>
                    <Typography color="text.secondary">
                      <TooltipText title={tooltips?.trades}>
                        {cell.trades}t ·{" "}
                        {hasTrades ? (
                          <WinRateBadge compact winRate={cell.winRate} />
                        ) : (
                          "—"
                        )}
                      </TooltipText>
                    </Typography>
                  </Box>

                  <Box sx={{ display: { xs: "none", sm: "block" }, mt: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: hasTrades
                          ? tradePnlUsdt >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary",
                      }}
                    >
                      <TooltipText title={tooltips?.trade}>
                        Trade: {hasTrades ? formatSignedUsdt(tradePnlUsdt) : "$0.00"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color={
                        hasTrades
                          ? cell.tradePnlPercent >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.tradePnlPercent}>
                        Trade PnL: {hasTrades
                          ? formatSignedPercent(cell.tradePnlPercent)
                          : "—"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.winRate}>
                        Win rate:{" "}
                        {hasTrades ? (
                          <WinRateBadge winRate={cell.winRate} />
                        ) : (
                          "—"
                        )}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color={
                        balancePnlUsdt !== null
                          ? balanceToneValue >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.balance}>
                        Bal:{" "}
                        {balancePnlUsdt !== null
                          ? formatSignedUsdt(balancePnlUsdt)
                          : "—"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color={
                        balancePnlUsdt !== null
                          ? balanceToneValue >= 0
                            ? "success.main"
                            : "error.main"
                          : "text.secondary"
                      }
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.balancePnl}>
                        Bal PnL: {formatSignedPercent(cell.balancePnlPercentOfStart)}
                      </TooltipText>
                    </Typography>
                  </Box>

                  <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    <Divider sx={{ my: 0.75 }} />

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.trades}>
                        {cell.trades} trade{cell.trades === 1 ? "" : "s"}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.start}>
                        Start: {formatUsdt(cell.startBalance)}
                      </TooltipText>
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      <TooltipText title={tooltips?.end}>
                        End: {formatUsdt(cell.endBalance)}
                      </TooltipText>
                    </Typography>
                  </Box>
                </Paper>
              ) : (
                <Box sx={{ minHeight: { xs: 88, sm: 166 } }} />
              )}
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
