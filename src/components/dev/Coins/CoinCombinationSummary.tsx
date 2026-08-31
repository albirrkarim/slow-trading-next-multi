"use client";

import { CopyText } from "@/components/ui/CopyText";
import DurationSharePieChart from "@/components/ui/Chart/DurationSharePieChart";
import type { CoinCombinationAnalysis } from "@/lib/devBacktest/coins/capital-efficiency";
import { Box, Chip, Paper, Typography } from "@mui/material";
import moment from "moment";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs === 0) return "0 seconds";
  return moment.duration(durationMs).humanize();
}

export default function CoinCombinationSummary({
  analysis,
  requestedSize,
}: {
  analysis: CoinCombinationAnalysis;
  requestedSize: number;
}) {
  const metrics = [
    ["Capital efficiency", `${analysis.capitalEfficiencyScore.toFixed(1)} / 100`],
    ["Captured entries", analysis.acceptedEntries.toString()],
    ["Missed while locked", analysis.missedEntries.toString()],
    ["Entry opportunities", analysis.totalEntryOpportunities.toString()],
  ];
  const durationMetrics = [
    ["Locked total", formatDuration(analysis.holdDurationTotalMs)],
    ["Locked min", formatDuration(analysis.holdDurationMinMs)],
    ["Locked avg", formatDuration(analysis.holdDurationAvgMs)],
    ["Locked max", formatDuration(analysis.holdDurationMaxMs)],
    ["Unused total", formatDuration(analysis.unusedDurationTotalMs)],
    ["Unused min", formatDuration(analysis.unusedDurationMinMs)],
    ["Unused avg", formatDuration(analysis.unusedDurationAvgMs)],
    ["Unused max", formatDuration(analysis.unusedDurationMaxMs)],
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box
        sx={{
          alignItems: { xs: "flex-start", md: "center" },
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 1,
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography fontWeight={600}>
            {requestedSize === 0 ? "All coins" : "Best coin combination"}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            One capital allocation is locked from threshold entry until level 0.
            Score is the percentage of entry opportunities it can capture.
          </Typography>
        </Box>
        <Typography color="text.secondary" variant="caption">
          {analysis.method === "all"
            ? "All coins"
            : analysis.method === "optimized"
              ? "Optimized search"
              : "Exact search"}
          {` · ${analysis.evaluatedCombinations.toLocaleString()} combinations evaluated`}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
        {analysis.symbols.map((symbol) => (
          <Chip color="primary" key={symbol} label={symbol} />
        ))}
      </Box>

      <CopyText
        text={analysis.symbols.join(", ")}
      />

      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          mt: 2,
        }}
      >
        {metrics.map(([label, value]) => (
          <Box key={label}>
            <Typography color="text.secondary" variant="caption">
              {label}
            </Typography>
            <Typography variant="h6">{value}</Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr 1fr",
            md: "repeat(4, minmax(0, 1fr))",
          },
          mt: 1,
        }}
      >
        {durationMetrics.map(([label, value]) => (
          <Box key={label}>
            <Typography color="text.secondary" variant="caption">
              {label}
            </Typography>
            <Typography variant="h6">{value}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 1.5, maxWidth: 360 }}>
        <DurationSharePieChart
          holdDurationMs={analysis.holdDurationTotalMs}
          title="Locked vs unused duration"
          unusedDurationMs={analysis.unusedDurationTotalMs}
        />
      </Box>
    </Paper>
  );
}
