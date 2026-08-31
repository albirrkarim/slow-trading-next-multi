"use client";

import { formatDuration as formatExactDuration } from "@/lib/dynamic/client";
import { Box, Typography } from "@mui/material";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLORS = {
  hold: "#f97316",
  unused: "#22c55e",
};

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "—";
  return formatExactDuration(durationMs);
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`;
}

/**
 * Shows the percentage split between time with capital locked in positions and
 * time where capital is idle/unused.
 */
export default function DurationSharePieChart({
  holdDurationMs,
  title = "Hold vs unused duration",
  unusedDurationMs,
}: {
  holdDurationMs: number | null | undefined;
  title?: string;
  unusedDurationMs: number | null | undefined;
}) {
  const hold = Math.max(0, Number(holdDurationMs) || 0);
  const unused = Math.max(0, Number(unusedDurationMs) || 0);
  const total = hold + unused;

  if (total <= 0) {
    return null;
  }

  const data = [
    {
      color: COLORS.hold,
      durationMs: hold,
      name: "Hold",
      value: hold,
    },
    {
      color: COLORS.unused,
      durationMs: unused,
      name: "Unused",
      value: unused,
    },
  ].filter((item) => item.value > 0);

  return (
    <Box sx={{ minWidth: 220, width: "100%" }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      <Box sx={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="45%"
              label={({ name, value }) =>
                `${name} ${formatPct((Number(value) / total) * 100)}`
              }
              nameKey="name"
              outerRadius="75%"
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell fill={entry.color} key={entry.name} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${formatDuration(Number(value))} (${formatPct(
                  (Number(value) / total) * 100,
                )})`,
                name,
              ]}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
