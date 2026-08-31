"use client";

import { Box, Button } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useState } from "react";
import {
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis
} from "recharts";

export function NetProfitPercentHistorySparkline(props: {
  history?: {
    t: number;
    pct: number;
  }[];
  height?: number;
  exitTimeMs?: number;
  enableTimeDisplayToggle?: boolean;
}) {
  const theme = useTheme();
  const { history, height = 60, exitTimeMs, enableTimeDisplayToggle = false } = props;
  const [showUtcTime, setShowUtcTime] = useState(false);

  if (!history || history.length < 2) return null;

  const data = history
    .filter(
      (p) =>
        typeof p?.t === "number" &&
        Number.isFinite(p.t) &&
        typeof p?.pct === "number" &&
        Number.isFinite(p.pct),
    )
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t, v: p.pct }));

  if (data.length < 2) return null;

  const last = exitTimeMs ? data.find((p) => p.t >= exitTimeMs) ?? data.at(-1) : data.at(-1);

  const stroke =
    typeof last?.v === "number" && last.v >= 0
      ? theme.palette.success.main
      : theme.palette.error.main;

  const exitPoint = (() => {
    if (typeof exitTimeMs !== "number" || !Number.isFinite(exitTimeMs)) return null;
    if (data.length === 0) return null;

    const firstT = data[0].t;
    const lastT = data[data.length - 1].t;
    if (exitTimeMs < firstT || exitTimeMs > lastT) return null;

    let best = data[0];
    let bestDiff = Math.abs(best.t - exitTimeMs);
    for (let i = 1; i < data.length; i++) {
      const d = data[i];
      const diff = Math.abs(d.t - exitTimeMs);
      if (diff < bestDiff) {
        best = d;
        bestDiff = diff;
      }
    }
    return best;
  })();

  const formatTooltipTime = (value: number) => {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    const date = new Date(timestamp);
    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(showUtcTime ? { timeZone: "UTC" } : {}),
    };

    return showUtcTime
      ? `${date.toLocaleString(undefined, formatOptions)} UTC`
      : date.toLocaleString(undefined, formatOptions);
  };

  return (
    <Box sx={{ position: "relative", width: "100%", minWidth: 120, height }}>
      {enableTimeDisplayToggle ? (
        <Button
          size="small"
          variant="outlined"
          onClick={() => setShowUtcTime((prev) => !prev)}
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 2,
            minWidth: 0,
            px: 0.75,
            py: 0.125,
            fontSize: "0.625rem",
            lineHeight: 1.1,
          }}
          title={showUtcTime ? "Switch PNL tooltip time to local" : "Switch PNL tooltip time to UTC"}
        >
          {showUtcTime ? "UTC" : "Local"}
        </Button>
      ) : null}
      <ResponsiveContainer width="100%" height="100%" minWidth={120} minHeight={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <ReferenceLine
            y={0}
            stroke={alpha(theme.palette.text.primary, 0.5)}
            strokeDasharray="3 3"
          />
          <Tooltip
            isAnimationActive={false}
            formatter={(value: any) => [`${Number(value).toFixed(2)}%`, "PnL"]}
            labelFormatter={(label: any) => formatTooltipTime(Number(label))}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              boxShadow: theme.shadows[2],
            }}
            labelStyle={{ color: theme.palette.text.secondary }}
            itemStyle={{ color: theme.palette.text.primary }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={alpha(stroke, 0.95)}
            strokeWidth={2.25}
            dot={false}
            isAnimationActive={false}
          />
          {exitPoint ? (
            <>
              <ReferenceLine
                x={exitPoint.t}
                stroke={alpha(theme.palette.warning.main, 0.9)}
                strokeWidth={1}
              />
              <ReferenceDot
                x={exitPoint.t}
                y={exitPoint.v}
                r={4}
                fill={theme.palette.warning.main}
                stroke={alpha(theme.palette.warning.dark ?? theme.palette.warning.main, 0.9)}
                strokeWidth={1}
              />
            </>
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
