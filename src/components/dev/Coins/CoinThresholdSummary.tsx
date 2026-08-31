"use client";

import type { ThresholdAnalysis } from "./threshold-analysis";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import moment from "moment";
import { memo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function CoinThresholdSummary({
  analysis,
}: {
  analysis: ThresholdAnalysis;
}) {
  const monthlyData = analysis.monthlyEntries.map((item) => ({
    count: item.count,
    month: moment.utc(item.monthStart).format("MMM YY"),
  }));
  const metrics = [
    ["Total entry points", analysis.entries.length.toString()],
    ["Max entries / month", analysis.maximumEntriesPerMonth.toString()],
    ["Avg entries / month", analysis.averageEntriesPerMonth.toFixed(2)],
    ["Min entries / month", analysis.minimumEntriesPerMonth.toString()],
    ["Sequences exceeding max", analysis.exceededSequenceCount.toString()],
  ];

  return (
    <Box sx={{ mt: 2 }}>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr 1fr",
            md: "repeat(5, minmax(0, 1fr))",
          },
        }}
      >
        {metrics.map(([label, value]) => (
          <Paper key={label} variant="outlined" sx={{ p: 1.5 }}>
            <Typography color="text.secondary" variant="caption">
              {label}
            </Typography>
            <Typography variant="h6">{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(0, 3fr) minmax(180px, 1fr)",
          },
          mt: 2,
        }}
      >
        <Box sx={{ width: "100%", minWidth: 0, height: 300 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Entries" fill="#1976d2" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Paper variant="outlined" sx={{ maxHeight: 300, overflow: "auto" }}>
          <List dense disablePadding>
            {monthlyData.map((item) => (
              <ListItem divider key={item.month}>
                <ListItemText primary={item.month} />
                <Typography fontWeight={600}>{item.count}</Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    </Box>
  );
}

export default memo(CoinThresholdSummary);
