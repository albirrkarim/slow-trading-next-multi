"use client";

import { ToggleableLegend } from "@/components/LiveDashboard/Shared/ToggleableLegend";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import { Box, Grid, Paper, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SlowTradingReportRow } from "./types";
import {
  computeBalanceSeries,
  computeDailyDrawdownStats,
  computeDailyHoldStats,
  computeDailyPnlPercentStats,
  computeDailyPnlUsdtStats,
  computeDailyStats,
  formatHoldMs,
} from "./utils";

function ChartCard({
  title,
  data,
  yTickFormatter,
  tooltipFormatter,
  lines,
}: {
  title: string;
  data: Record<string, unknown>[];
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  lines: Array<{ dataKey: string; color: string; name: string }>;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const axisTick = { fontSize: 12 };

  return (
    <Paper variant="outlined" sx={{ px: 0.5, bgcolor: "background.default" }}>
      <HeaderMetrics
        defaultExpanded={false}
        headerCanBeClicked
        rememberExpand={`trade-history-chart:${title}`}
        title={
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            {title}
          </Typography>
        }
      >
        {(expanded) =>
          expanded && (
            <Box
              aria-label={`${title} chart`}
              sx={{ width: "100%", height: 260, mt: 1 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={axisTick} />
                  <YAxis
                    tick={axisTick}
                    allowDecimals
                    tickFormatter={
                      yTickFormatter
                        ? (value) => yTickFormatter(Number(value))
                        : undefined
                    }
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    itemStyle={{ fontSize: 12 }}
                    labelStyle={{ fontSize: 12 }}
                    formatter={(value) => {
                      const num = Number(value);
                      return [
                        tooltipFormatter ? tooltipFormatter(num) : num,
                        "",
                      ];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    content={(props) => (
                      <ToggleableLegend
                        payload={props.payload as unknown as any[]}
                        hidden={hidden}
                        onToggle={(dataKey) =>
                          setHidden((prev) => ({
                            ...prev,
                            [dataKey]: !(prev[dataKey] ?? false),
                          }))
                        }
                      />
                    )}
                  />
                  {lines.map((line) => (
                    <Line
                      key={line.dataKey}
                      type="monotone"
                      dataKey={line.dataKey}
                      stroke={line.color}
                      strokeWidth={2}
                      dot={false}
                      hide={hidden[line.dataKey] ?? false}
                      name={line.name}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )
        }
      </HeaderMetrics>
    </Paper>
  );
}

export function ChartsSection({
  history,
  startingBalanceUSDT,
}: {
  history: SlowTradingReportRow[];
  startingBalanceUSDT: number;
}) {
  const trades = useMemo(() => computeDailyStats(history), [history]);
  const drawdown = useMemo(() => computeDailyDrawdownStats(history), [history]);
  const pnlUsdt = useMemo(
    () =>
      computeDailyPnlUsdtStats(history).reduce<
        Array<ReturnType<typeof computeDailyPnlUsdtStats>[number] & { pnlUsdtCumulative: number }>
      >(
        (rows, row) => (
          rows.push({
            ...row,
            pnlUsdtCumulative:
              (rows.at(-1)?.pnlUsdtCumulative ?? 0) + row.pnlUsdtSum,
          }),
          rows
        ),
        [],
      ),
    [history],
  );
  const pnlPct = useMemo(
    () =>
      computeDailyPnlPercentStats(history).reduce<
        Array<ReturnType<typeof computeDailyPnlPercentStats>[number] & { pnlPercentCumulative: number }>
      >(
        (rows, row) => (
          rows.push({
            ...row,
            pnlPercentCumulative:
              (rows.at(-1)?.pnlPercentCumulative ?? 0) + row.pnlPercentSum,
          }),
          rows
        ),
        [],
      ),
    [history],
  );
  const hold = useMemo(() => computeDailyHoldStats(history), [history]);
  const balance = useMemo(
    () => computeBalanceSeries({ history, startingBalanceUSDT }),
    [history, startingBalanceUSDT],
  );

  return (
    <Grid container spacing={0.5} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Trades / Wins / Losses Over Time"
          data={trades}
          lines={[
            { dataKey: "trades", color: "#1976d2", name: "Trades" },
            { dataKey: "wins", color: "#2e7d32", name: "Wins" },
            { dataKey: "losses", color: "#d32f2f", name: "Losses" },
          ]}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Max Drawdown % Over Time"
          data={drawdown}
          yTickFormatter={(value) => `${value.toFixed(2)}%`}
          tooltipFormatter={(value) => `${value.toFixed(2)}%`}
          lines={[
            { dataKey: "drawdownMin", color: "#d32f2f", name: "Worst" },
            { dataKey: "drawdownAvg", color: "#1976d2", name: "Avg" },
            { dataKey: "drawdownMax", color: "#2e7d32", name: "Best" },
          ]}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Sum USDT Over Time"
          data={pnlUsdt}
          yTickFormatter={(value) => `$${value.toFixed(2)}`}
          tooltipFormatter={(value) => `$${value.toFixed(2)}`}
          lines={[
            { dataKey: "pnlUsdtSum", color: "#1976d2", name: "Daily Sum" },
            { dataKey: "pnlUsdtCumulative", color: "#9c27b0", name: "Cumulative" },
            { dataKey: "pnlUsdtWinSum", color: "#2e7d32", name: "Daily Win Sum" },
            { dataKey: "pnlUsdtLossSum", color: "#d32f2f", name: "Daily Loss Sum" },
          ]}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Sum PnL % Over Time"
          data={pnlPct}
          yTickFormatter={(value) => `${value.toFixed(2)}%`}
          tooltipFormatter={(value) => `${value.toFixed(2)}%`}
          lines={[
            { dataKey: "pnlPercentSum", color: "#1976d2", name: "Daily Sum" },
            { dataKey: "pnlPercentCumulative", color: "#9c27b0", name: "Cumulative" },
            { dataKey: "pnlPercentWinSum", color: "#2e7d32", name: "Daily Win Sum" },
            { dataKey: "pnlPercentLossSum", color: "#d32f2f", name: "Daily Loss Sum" },
          ]}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Hold Time Over Time"
          data={hold}
          yTickFormatter={(value) => formatHoldMs(value)}
          tooltipFormatter={(value) => formatHoldMs(value)}
          lines={[
            { dataKey: "holdMinMs", color: "#d32f2f", name: "Min" },
            { dataKey: "holdAvgMs", color: "#1976d2", name: "Avg" },
            { dataKey: "holdMaxMs", color: "#2e7d32", name: "Max" },
          ]}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard
          title="Balance Over Time"
          data={balance}
          yTickFormatter={(value) => `$${value.toFixed(2)}`}
          tooltipFormatter={(value) => `$${value.toFixed(2)}`}
          lines={[{ dataKey: "balance", color: "#9c27b0", name: "Balance" }]}
        />
      </Grid>
    </Grid>
  );
}
