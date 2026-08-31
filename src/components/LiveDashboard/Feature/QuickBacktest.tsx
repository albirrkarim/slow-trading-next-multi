"use client";

import { useEffect, useMemo, useState } from "react";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useSnackbar } from "notistack";

import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import { endpoints } from "@/components/endpoints";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import ButtonDialog from "@/components/ui/ButtonDialog";
import type { VolatilityPoint } from "@/lib/dynamic";
import type {
  SlowQuickBacktestResult,
  SlowTradingDashboardState,
} from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";
import slowTradingAccountConfig from "@/lib/slowTrading/account-config";
import { DEFAULT_COLORS } from "@/components/client/constants";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import DurationSharePieChart from "@/components/ui/Chart/DurationSharePieChart";
import DailyPnlCalendarDialog, {
  buildTradePnlBalanceSnapshots,
  toDailyPnlCalendarTrade,
  type DailyPnlCalendarTrade,
} from "../Shared/DailyPnlCalendarDialog";
import { buildQuickBacktestTradeCountBySymbol } from "./quick-backtest-trade-count";
import QuickBacktestTradeHistory from "./QuickBacktestTradeHistory";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface QuickBacktestProps {
  dashboardState: SlowTradingDashboardState;
  endTime?: number;
  range: string;
  startTime?: number;
  volume24hBySymbol?: Record<string, number>;
  volatilityMap: Record<string, VolatilityPoint[]>;
  onSimulationSeriesChange: (series: {
    names: string[];
    series: LeveledMarkers[][];
  }) => void;
}

function formatUsdt(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function cropVolatilityMapForQuickBacktest({
  volatilityMap,
  symbols,
  startTime,
  endTime,
}: {
  volatilityMap: Record<string, VolatilityPoint[]>;
  symbols: string[];
  startTime?: number;
  endTime?: number;
}) {
  const allowedSymbols = new Set(
    [...symbols, "BTC"].map((symbol) => symbol.trim().toUpperCase()),
  );
  const cropped: Record<string, VolatilityPoint[]> = {};

  for (const [symbol, points] of Object.entries(volatilityMap)) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!allowedSymbols.has(normalizedSymbol)) continue;

    cropped[normalizedSymbol] = points
      .filter((point) => {
        if (startTime !== undefined && point.t < startTime) return false;
        if (endTime !== undefined && point.t > endTime) return false;
        return true;
      })
      .map(
        (point) =>
          ({
            id: point.id,
            l: point.l,
            lvl: point.lvl,
            message: point.message,
            p: point.p,
            pct: point.pct,
            symbol: normalizedSymbol,
            t: point.t,
            vb: point.vb,
            vq: point.vq,
          }) as VolatilityPoint,
      );
  }

  return cropped;
}

function QuickBacktestTradeCountPieChart({
  data,
}: {
  data: ReturnType<typeof buildQuickBacktestTradeCountBySymbol>;
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total <= 0) {
    return null;
  }

  return (
    <Box sx={{ minWidth: 220, width: "100%" }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Trade count by coin
      </Typography>
      <Box sx={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              innerRadius="45%"
              nameKey="symbol"
              outerRadius="75%"
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell
                  fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                  key={entry.symbol}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${Number(value).toLocaleString()} trade(s)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          maxHeight: 92,
          overflowY: "auto",
          pt: 0.5,
        }}
      >
        {data.map((item, index) => (
          <Chip
            key={item.symbol}
            label={`${item.symbol}: ${item.count.toLocaleString()}`}
            size="small"
            sx={{
              borderColor: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
              color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
              fontSize: "0.72rem",
              height: 22,
            }}
            variant="outlined"
          />
        ))}
      </Box>
    </Box>
  );
}

export default function QuickBacktest({
  dashboardState,
  endTime,
  range,
  startTime,
  volume24hBySymbol,
  volatilityMap,
  onSimulationSeriesChange,
}: QuickBacktestProps) {
  const { enqueueSnackbar } = useSnackbar();
  const enabledAccounts = useMemo(
    () =>
      dashboardState.runtime.exchangeAccounts.filter(
        (account) => account.enabled,
      ),
    [dashboardState.runtime.exchangeAccounts],
  );
  const [startAmounts, setStartAmounts] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SlowQuickBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStartAmounts((current) =>
      Object.fromEntries(
        enabledAccounts.map((account) => [
          account.slug,
          current[account.slug] ?? account.sandbox.initialBalanceUSDT,
        ]),
      ),
    );
  }, [enabledAccounts]);

  const rangedVolatilityMap = useMemo(
    () =>
      cropVolatilityMapForQuickBacktest({
        volatilityMap,
        symbols: dashboardState.config.symbols,
        startTime,
        endTime,
      }),
    [dashboardState.config.symbols, endTime, startTime, volatilityMap],
  );

  const execute = async () => {
    const hasPoints = Object.values(rangedVolatilityMap).some(
      (points) => points.length > 0,
    );
    if (!hasPoints) {
      setResult(null);
      onSimulationSeriesChange({ names: [], series: [] });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post<SlowQuickBacktestResult>(
        endpoints.slow.prod.quickBacktest,
        {
          config: dashboardState.config,
          accounts: enabledAccounts.map((account) => ({
            slug: account.slug,
            name: account.name,
            enabled: account.enabled,
            config: slowTradingAccountConfig.trading.toEffectiveConfig(
              dashboardState.config,
              account,
            ),
            startAmount:
              startAmounts[account.slug] ?? account.sandbox.initialBalanceUSDT,
          })),
          endTime,
          range,
          startAmount: Object.values(startAmounts)[0] ?? 100,
          startTime,
          volume24hBySymbol,
          volatilityMap: rangedVolatilityMap,
        },
      );

      setResult(response.data);
      onSimulationSeriesChange(response.data.simulationSeries);
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        `Quick Backtest failed: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setLoading(false);
    }
  };

  const metrics = result?.metrics;
  const calendarTrades = useMemo<DailyPnlCalendarTrade[]>(
    () => (result?.tradeHistory ?? []).map(toDailyPnlCalendarTrade),
    [result?.tradeHistory],
  );
  const quickBacktestBalanceSnapshots = useMemo(
    () =>
      buildTradePnlBalanceSnapshots({
        history: calendarTrades,
        startingBalanceUSDT: Object.values(startAmounts).reduce(
          (total, amount) => total + amount,
          0,
        ),
      }),
    [calendarTrades, startAmounts],
  );
  const tradeCountBySymbol = useMemo(
    () => buildQuickBacktestTradeCountBySymbol(result?.tradeHistory ?? []),
    [result?.tradeHistory],
  );

  return (
    <HeaderMetrics
      title={
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Quick Backtest
        </Typography>
      }
    >
      {(expand) =>
        expand && (
          <>
            <Box
              sx={{
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: 1.5,
                my: 1.5,
              }}
            >
              {enabledAccounts.map((account) => (
                <TextField
                  key={account.slug}
                  label={`${account.name || account.slug} start`}
                  size="small"
                  type="number"
                  value={
                    startAmounts[account.slug] ??
                    account.sandbox.initialBalanceUSDT
                  }
                  onChange={(event) =>
                    setStartAmounts((current) => ({
                      ...current,
                      [account.slug]: Number(event.target.value),
                    }))
                  }
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      step: 10,
                    },
                  }}
                  sx={{ width: 180 }}
                />
              ))}
              <Button
                disabled={loading}
                onClick={() => void execute()}
                size="small"
                startIcon={
                  loading ? <CircularProgress size={14} /> : <PlayArrowIcon />
                }
                variant="contained"
              >
                {loading ? "Running..." : "Run"}
              </Button>
              <ButtonDialog
                disabled={!result?.tradeHistory.length}
                maxWidth="xl"
                title={`Trade History (${result?.tradeHistory.length ?? 0})`}
                titleLong="Quick Backtest Trade History"
                variant="outlined"
              >
                {() => (
                  <QuickBacktestTradeHistory
                    accounts={enabledAccounts}
                    exchangeType={dashboardState.config.exchangeType}
                    history={result?.tradeHistory ?? []}
                  />
                )}
              </ButtonDialog>
              <ButtonDialog
                disabled={!result?.tradeHistory.length}
                maxWidth={false}
                contentSx={{ p: { xs: 0, sm: 1 } }}
                title="Daily PnL"
                titleLong="Quick Backtest Daily PnL Calendar"
                variant="outlined"
                startIcon={<CalendarMonthIcon />}

              >
                {() => (
                  <DailyPnlCalendarDialog
                    balanceSnapshots={quickBacktestBalanceSnapshots}
                    history={calendarTrades}
                    startingBalanceUSDT={Object.values(startAmounts).reduce(
                      (total, amount) => total + amount,
                      0,
                    )}
                    description="Trade PnL and running balance are reconstructed from Quick Backtest closed trade history."
                  />
                )}
              </ButtonDialog>
              <Typography variant="caption" color="text.secondary">
                Uses the current cropped Volatility Points + live trade config.
              </Typography>
            </Box>

            {metrics && (
              <>
                <Grid container spacing={1}>
                  <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2, xl: 2 }}>
                    <Typography variant="body1" gutterBottom>
                      Entry count: {metrics.entryCount}
                    </Typography>

                    <Typography variant="body1" gutterBottom>
                      Sharpe ratio: {formatNumber(metrics.sharpeRatio)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2, xl: 2 }}>
                    <Typography variant="body1" gutterBottom>
                      Gain: {formatNumber(metrics.gainPct)}% -{" "}
                      {formatUsdt(metrics.gainUsdt)}
                    </Typography>

                    <Typography variant="body1" gutterBottom>
                      Final USDT: {formatUsdt(metrics.finalUsdt)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 2, lg: 2, xl: 2 }}>
                    <Typography variant="body1" gutterBottom>
                      Avg profit / week:{" "}
                      {formatUsdt(metrics.avgProfitUsdtPerWeek)}
                    </Typography>

                    <Typography variant="body1" gutterBottom>
                      Max position DD:{" "}
                      {formatNumber(metrics.maxPositionDrawdownPct)}%
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 3 }}>
                    <Typography variant="body1" gutterBottom>
                      Hold duration: total {metrics.totalHoldDuration} | min{" "}
                      {metrics.minHoldDuration} | avg {metrics.avgHoldDuration}{" "}
                      | max {metrics.maxHoldDuration}
                    </Typography>

                    <Typography variant="body1" gutterBottom>
                      Unused capital duration: total{" "}
                      {metrics.totalUnusedCapitalDuration} | min{" "}
                      {metrics.minUnusedCapitalDuration} | avg{" "}
                      {metrics.avgUnusedCapitalDuration} | max{" "}
                      {metrics.maxUnusedCapitalDuration}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4, lg: 2, xl: 2 }}>
                    <DurationSharePieChart
                      holdDurationMs={metrics.totalActiveCapitalDurationMs}
                      title="Backtest capital duration"
                      unusedDurationMs={metrics.totalUnusedCapitalDurationMs}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4, lg: 2, xl: 2 }}>
                    <QuickBacktestTradeCountPieChart
                      data={tradeCountBySymbol}
                    />
                  </Grid>
                </Grid>

                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Growth overtime
                </Typography>
                <MultiLineTimelined
                  height={300}
                  names={result.growthOvertimeSeries.names}
                  series={result.growthOvertimeSeries.series}
                  colors={DEFAULT_COLORS}
                />
              </>
            )}
          </>
        )
      }
    </HeaderMetrics>
  );
}
