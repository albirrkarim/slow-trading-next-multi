"use client";

import { Box, Chip, Paper, Typography, useTheme } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BlackSwanSavingsPositionResult } from "@/lib/devBacktest/black-swan";

interface ExitReasonDatum {
  [key: string]: number | string;
  count: number;
  reason: BlackSwanSavingsPositionResult["protectedExitReason"];
  sharePct: number;
}

/** Counts actual protected-timeline exits by their canonical close reason. */
function countExitReasons(
  positions: BlackSwanSavingsPositionResult[],
): ExitReasonDatum[] {
  const counts = positions.reduce((result, position) => {
    const reason = position.protectedExitReason;
    result.set(reason, (result.get(reason) ?? 0) + 1);
    return result;
  }, new Map<BlackSwanSavingsPositionResult["protectedExitReason"], number>());
  const total = positions.length;

  return Array.from(counts, ([reason, count]) => ({
    count,
    reason,
    sharePct: total > 0 ? (count / total) * 100 : 0,
  })).sort(
    (left, right) =>
      right.count - left.count || left.reason.localeCompare(right.reason),
  );
}

export default function BlackSwanExitReasonChart({
  positions,
}: {
  positions: BlackSwanSavingsPositionResult[];
}) {
  // BTEST:BLACK_SWAN_EXIT_REASON_CHART
  const theme = useTheme();
  const data = countExitReasons(positions);
  const colors = [
    theme.palette.error.main,
    theme.palette.secondary.main,
    theme.palette.warning.main,
    theme.palette.success.main,
    theme.palette.info.main,
    theme.palette.text.secondary,
  ];

  return (
    <Paper component="section" variant="outlined" sx={{ height: "100%", p: 1.5 }}>
      <Typography fontWeight={800} variant="subtitle1">
        Exit reasons
      </Typography>

      {data.length > 0 ? (
        <>
          <Box
            aria-label="Actual position exit reasons pie chart"
            sx={{ height: 250, minWidth: 0 }}
          >
            <ResponsiveContainer height="100%" minWidth={0} width="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  innerRadius="46%"
                  nameKey="reason"
                  outerRadius="82%"
                  paddingAngle={2}
                >
                  {data.map((item, index) => (
                    <Cell
                      fill={colors[index % colors.length]}
                      key={item.reason}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const datum = item.payload as ExitReasonDatum;
                    return [
                      `${Number(value)} (${datum.sharePct.toFixed(1)}%)`,
                      datum.reason,
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          <Box display="flex" flexWrap="wrap" gap={0.75}>
            {data.map((item, index) => (
              <Chip
                key={item.reason}
                label={`${item.reason}[${item.count}]`}
                size="small"
                sx={{ borderColor: colors[index % colors.length] }}
                variant="outlined"
              />
            ))}
          </Box>
        </>
      ) : (
        <Typography color="text.secondary" sx={{ py: 3 }} variant="body2">
          No exits.
        </Typography>
      )}
    </Paper>
  );
}
