"use client";

import type { SlowEntrySequenceInterval } from "@/lib/slowTrading/client";
import { Box, Typography, useTheme } from "@mui/material";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildEntrySequenceHoldDurationDistribution } from "./entry-sequence-hold-duration";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Returns the non-negative duration of one entry sequence. */
function getHoldDurationMs(interval: SlowEntrySequenceInterval): number {
  return Math.max(0, interval.endTimeMs - interval.startTimeMs);
}

/** Formats a hold duration as a compact maximum-duration metric. */
function formatHoldDuration(durationMs: number): string {
  const normalizedDurationMs = Math.max(0, durationMs);
  const days = Math.floor(normalizedDurationMs / DAY_MS);
  const hours = Math.floor((normalizedDurationMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((normalizedDurationMs % HOUR_MS) / MINUTE_MS);

  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `${minutes}m`;
}

export default function EntrySequenceHoldDurationChart({
  intervals,
}: {
  intervals: SlowEntrySequenceInterval[];
}) {
  const theme = useTheme();
  const data = useMemo(
    () => buildEntrySequenceHoldDurationDistribution(intervals),
    [intervals],
  );
  const longestInterval = useMemo(
    () =>
      intervals.reduce<SlowEntrySequenceInterval | null>(
        (longest, interval) =>
          !longest || getHoldDurationMs(interval) > getHoldDurationMs(longest)
            ? interval
            : longest,
        null,
      ),
    [intervals],
  );

  if (intervals.length === 0) return null;

  return (
    <Box sx={{ mt: 2, minWidth: 0 }}>
      <Box
        sx={{
          alignItems: "baseline",
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          justifyContent: "space-between",
        }}
      >
        <Typography fontWeight={600} variant="body2">
          Hold duration distribution
        </Typography>
        {longestInterval && (
          <Typography color="primary.main" fontWeight={700} variant="caption">
            Longest hold: {formatHoldDuration(getHoldDurationMs(longestInterval))}
            {" · "}
            {longestInterval.symbol}
          </Typography>
        )}
      </Box>
      <Typography color="text.secondary" variant="caption">
        Entry candidate → directional sequence end · current range
      </Typography>
      <Box sx={{ height: 240, mt: 1, minWidth: 0 }}>
        <ResponsiveContainer height="100%" minWidth={0} width="100%">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ bottom: 4, left: -12, right: 8, top: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, _name, item) => {
                const payload = item.payload as {
                  count: number;
                  share: number;
                };
                return [
                  `${Number(value).toLocaleString()} (${payload.share.toFixed(1)}%)`,
                  "Sequences",
                ];
              }}
            />
            <Bar
              dataKey="count"
              fill={theme.palette.primary.main}
              name="Sequences"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
