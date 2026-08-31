"use client";

import HeaderMetrics from "@/components/ui/HeaderMetrics";
import { Box, Paper, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SlowTradingReportRow } from "./types";
import {
  computeMaxUpDistribution,
  DEFAULT_MAX_UP_DISTRIBUTION_INTERVAL_PCT,
  MIN_MAX_UP_DISTRIBUTION_INTERVAL_PCT,
  normalizeMaxUpDistributionInterval,
} from "./utils";

function getBucketColor(params: {
  maxPct: number;
  minPct: number;
  takeProfitPct: number;
}): string {
  if (!Number.isFinite(params.takeProfitPct) || params.takeProfitPct <= 0) {
    return "#1976d2";
  }
  if (params.minPct >= params.takeProfitPct) return "#2e7d32";
  if (
    params.takeProfitPct > params.minPct &&
    params.takeProfitPct < params.maxPct
  ) {
    return "#ed6c02";
  }
  return "#1976d2";
}

export default function MaxUpDistributionChart({
  history,
  takeProfitPct,
}: {
  history: SlowTradingReportRow[];
  takeProfitPct: number;
}) {
  const [intervalInput, setIntervalInput] = useState(
    String(DEFAULT_MAX_UP_DISTRIBUTION_INTERVAL_PCT),
  );
  const intervalPct = normalizeMaxUpDistributionInterval(
    Number(intervalInput),
  );
  const buckets = useMemo(
    () => computeMaxUpDistribution(history, intervalPct),
    [history, intervalPct],
  );
  const chartWidth = Math.max(480, buckets.length * 64);

  return (
    <Paper variant="outlined" sx={{ px: 0.5, bgcolor: "background.default" }}>
      <HeaderMetrics
        defaultExpanded={false}
        headerCanBeClicked
        rememberExpand="trade-history-chart:max-up-distribution"
        title={
          <Typography color="text.secondary" fontWeight={600} variant="body2">
            Max Up % Distribution
          </Typography>
        }
        titleRight={
          <Box
            onClick={(event) => event.stopPropagation()}
            sx={{ alignItems: "center", display: "flex", gap: 1 }}
          >
            <Typography
              color="text.secondary"
              sx={{ whiteSpace: "nowrap" }}
              variant="caption"
            >
              TP {Number.isFinite(takeProfitPct) ? takeProfitPct : 0}%
            </Typography>
            <TextField
              label="Interval %"
              onBlur={() => setIntervalInput(String(intervalPct))}
              onChange={(event) => setIntervalInput(event.target.value)}
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  min: MIN_MAX_UP_DISTRIBUTION_INTERVAL_PCT,
                  step: "0.1",
                },
              }}
              sx={{ width: 104 }}
              type="number"
              value={intervalInput}
            />
          </Box>
        }
      >
        {(expanded) =>
          expanded && (
            <Box sx={{ mt: 1, minWidth: 0 }}>
              {buckets.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
                  No Max Up history is available.
                </Typography>
              ) : (
                <Box
                  aria-label={`Max Up distribution chart, ${intervalPct}% interval`}
                  sx={{
                    maxWidth: "100%",
                    overflowX: "auto",
                    overscrollBehaviorX: "contain",
                    touchAction: "pan-x pan-y",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <Box sx={{ height: 280, minWidth: chartWidth }}>
                    <ResponsiveContainer height="100%" minWidth={0} width="100%">
                      <BarChart
                        data={buckets}
                        margin={{ bottom: 44, left: 0, right: 12, top: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          angle={-35}
                          dataKey="label"
                          height={64}
                          interval={0}
                          textAnchor="end"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value) => [Number(value), "Trades"]}
                          labelFormatter={(label) => `${label}% Max Up`}
                        />
                        <Bar dataKey="count" name="Trades">
                          {buckets.map((bucket) => (
                            <Cell
                              fill={getBucketColor({
                                ...bucket,
                                takeProfitPct,
                              })}
                              key={bucket.label}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              )}
            </Box>
          )
        }
      </HeaderMetrics>
    </Paper>
  );
}
