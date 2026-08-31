"use client";

import {
  Box,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BlackSwanBacktestResult } from "@/lib/devBacktest/black-swan";
import { getBlackSwanChartWindow } from "./chart-focus";

const STATE_COLORS = {
  NORMAL: "#dbeafe",
  WATCH: "#fef3c7",
  CRISIS: "#fee2e2",
  RECOVERY: "#ede9fe",
} as const;

function formatTime(value: number) {
  return new Date(value).toLocaleString();
}

function formatWindow(startTime: number, endTime: number) {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  };
  return `${new Date(startTime).toLocaleString([], options)} – ${new Date(
    endTime,
  ).toLocaleString([], options)}`;
}

function buildZones(points: BlackSwanBacktestResult["points"]) {
  const zones: Array<{
    from: number;
    to: number;
    status: keyof typeof STATE_COLORS;
  }> = [];
  for (const point of points) {
    const last = zones.at(-1);
    if (last?.status === point.status) {
      last.to = point.t;
    } else {
      zones.push({ from: point.t, to: point.t, status: point.status });
    }
  }
  return zones;
}

export default function BlackSwanCharts({
  result,
}: {
  result: BlackSwanBacktestResult;
}) {
  const incidentWindow = useMemo(
    () => getBlackSwanChartWindow(result),
    [result],
  );
  const [preferredRange, setPreferredRange] = useState<"incident" | "full">(
    "incident",
  );
  const range = incidentWindow.hasIncident ? preferredRange : "full";

  const visibleWindow =
    range === "incident"
      ? incidentWindow
      : {
          endTime: result.points.at(-1)?.t ?? result.endTime,
          hasIncident: incidentWindow.hasIncident,
          startTime: result.points.at(0)?.t ?? result.startTime,
        };
  const visiblePoints = result.points.filter(
    (point) =>
      point.t >= visibleWindow.startTime && point.t <= visibleWindow.endTime,
  );
  const zones = buildZones(visiblePoints);
  const visibleTransitions = result.transitions.filter(
    (transition) =>
      transition.t >= visibleWindow.startTime &&
      transition.t <= visibleWindow.endTime,
  );

  const transitionMarkers = [
    visibleTransitions.find((transition) => transition.to === "CRISIS"),
    visibleTransitions.find((transition) => transition.to === "NORMAL"),
  ].filter((transition) => transition !== undefined);

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: "minmax(0, 1fr)",
      }}
    >
      <Stack
        alignItems={{ xs: "stretch", sm: "center" }}
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        spacing={1.5}
      >
        <Box>
          <Typography fontWeight={700}>Chart time range</Typography>
          <Typography color="text.secondary" variant="body2">
            {range === "incident"
              ? `Incident plus 30 minutes of context: ${formatWindow(
                  visibleWindow.startTime,
                  visibleWindow.endTime,
                )}`
              : `Full selected backtest range: ${formatWindow(
                  visibleWindow.startTime,
                  visibleWindow.endTime,
                )}`}
          </Typography>
        </Box>
        <ToggleButtonGroup
          aria-label="Chart time range"
          color="primary"
          exclusive
          onChange={(_, value: "incident" | "full" | null) => {
            if (value) setPreferredRange(value);
          }}
          size="small"
          value={range}
        >
          <ToggleButton
            aria-label="Focus charts on the protection incident"
            disabled={!incidentWindow.hasIncident}
            value="incident"
          >
            Incident focus
          </ToggleButton>
          <ToggleButton
            aria-label="Show the full selected backtest range"
            value="full"
          >
            Full range
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Paper component="section" variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          BTC price and protection state
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          Background bands: blue Normal, amber Watch, red Crisis, purple
          Recovery.
        </Typography>
        <Box sx={{ height: { xs: 320, md: 420 }, minWidth: 0 }}>
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 320, width: 300 }}
            minWidth={0}
            width="100%"
          >
            <LineChart
              data={visiblePoints}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              {zones.map((zone, index) => (
                <ReferenceArea
                  key={`${zone.from}-${index}`}
                  x1={zone.from}
                  x2={zone.to}
                  fill={STATE_COLORS[zone.status]}
                  fillOpacity={0.5}
                />
              ))}
              {transitionMarkers.map((transition) => (
                <ReferenceLine
                  key={`${transition.t}-${transition.to}`}
                  label={{
                    fill: transition.to === "CRISIS" ? "#b91c1c" : "#166534",
                    fontSize: 12,
                    position: "insideTopRight",
                    value: transition.to === "CRISIS" ? "CRISIS" : "NORMAL",
                  }}
                  stroke={transition.to === "CRISIS" ? "#b91c1c" : "#166534"}
                  strokeDasharray="5 4"
                  x={transition.t}
                />
              ))}
              <XAxis
                dataKey="t"
                domain={[visibleWindow.startTime, visibleWindow.endTime]}
                scale="time"
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                type="number"
              />
              <YAxis
                dataKey="price"
                domain={["auto", "auto"]}
                tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                width={82}
              />
              <Tooltip
                labelFormatter={(value) => formatTime(Number(value))}
                formatter={(value) => [
                  `$${Number(value).toLocaleString()}`,
                  "BTC close",
                ]}
              />
              <Line
                dataKey="price"
                dot={false}
                isAnimationActive={false}
                name="BTC closed price"
                stroke="#1d4ed8"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Paper component="section" variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Detector evidence
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          Drawdowns are negative. Breadth is fetched/evaluated only when BTC
          reaches a warning threshold.
        </Typography>
        <Box sx={{ height: { xs: 320, md: 420 }, minWidth: 0 }}>
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 320, width: 300 }}
            minWidth={0}
            width="100%"
          >
            <LineChart
              data={visiblePoints}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                domain={[visibleWindow.startTime, visibleWindow.endTime]}
                scale="time"
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                type="number"
              />
              <YAxis
                yAxisId="drawdown"
                tickFormatter={(value) => `${value}%`}
                width={58}
              />
              <YAxis
                yAxisId="breadth"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                width={58}
              />
              <Tooltip
                labelFormatter={(value) => formatTime(Number(value))}
                formatter={(value, name) => [
                  `${Number(value).toFixed(2)}%`,
                  name,
                ]}
              />
              <Legend />
              <Line
                yAxisId="drawdown"
                dataKey="btc5Pct"
                dot={false}
                isAnimationActive={false}
                name="BTC 5m"
                stroke="#dc2626"
                strokeWidth={2}
              />
              <Line
                yAxisId="drawdown"
                dataKey="btc15Pct"
                dot={false}
                isAnimationActive={false}
                name="BTC 15m"
                stroke="#b45309"
                strokeDasharray="6 4"
                strokeWidth={2}
              />
              <Line
                yAxisId="drawdown"
                dataKey="btc60Pct"
                dot={false}
                isAnimationActive={false}
                name="BTC 60m"
                stroke="#7c3aed"
                strokeDasharray="2 4"
                strokeWidth={2}
              />
              <Line
                yAxisId="breadth"
                dataKey="breadthPct"
                dot={false}
                isAnimationActive={false}
                name="Alt breadth"
                stroke="#0369a1"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Box>
  );
}
