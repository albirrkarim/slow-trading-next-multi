"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Box, Button, Chip, Grid, Paper, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { SlowTradingReportRow } from "./types";

const CHART_COLORS = [
  "#d32f2f",
  "#ed6c02",
  "#9c27b0",
  "#1976d2",
  "#2e7d32",
  "#6d4c41",
  "#455a64",
];

type EvaluationCountDatum = {
  count: number;
  label: string;
};

type TradeOutcome = "loss" | "profit";

/** Aggregates evaluated trade counts by a normalized label. */
function buildEvaluationCounts(
  history: SlowTradingReportRow[],
  getLabel: (trade: SlowTradingReportRow) => string,
): EvaluationCountDatum[] {
  const counts = new Map<string, number>();

  for (const trade of history) {
    const label = getLabel(trade).trim().toUpperCase() || "UNKNOWN";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
}

/** Concatenates non-empty position notes with their coin symbols. */
function buildEvaluationNotes(history: SlowTradingReportRow[]): string {
  return history
    .flatMap((trade) => {
      const note = trade.notes?.trim();
      return note ? [`${trade.symbol.toUpperCase()}: ${note}`] : [];
    })
    .join("\n\n");
}

function EvaluationCountPieCard({
  counts,
  emptyMessage,
  title,
}: {
  counts: EvaluationCountDatum[];
  emptyMessage: string;
  title: string;
}) {
  return (
    <Paper variant="outlined" sx={{ height: "100%", p: 1.5 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        {title}
      </Typography>

      {counts.length > 0 ? (
        <>
          <Box
            aria-label={`${title} counts`}
            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
          >
            {counts.map((item) => (
              <Chip
                key={item.label}
                label={`${item.label} ${item.count}`}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>

          <Box
            aria-label={`${title} pie chart`}
            sx={{ width: "100%", height: 260 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={counts}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={82}
                >
                  {counts.map((item, index) => (
                    <Cell
                      key={item.label}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      )}
    </Paper>
  );
}

function EvaluationNotesCard({
  notes,
  outcome,
}: {
  notes: string;
  outcome: TradeOutcome;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const outcomeLabel = outcome === "loss" ? "Loss" : "Profit";

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(notes);
      enqueueSnackbar(`Copied all ${outcome} notes`, { variant: "success" });
    } catch {
      enqueueSnackbar(`Failed to copy ${outcome} notes`, { variant: "error" });
    }
  };

  return (
    <Paper variant="outlined" sx={{ height: "100%", p: 1.5 }}>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          {outcomeLabel} notes
        </Typography>
        <Button
          aria-label={`Copy all ${outcome} notes`}
          disabled={!notes}
          onClick={() => void handleCopyAll()}
          size="small"
          startIcon={<ContentCopyIcon fontSize="small" />}
          sx={{ minWidth: 0, px: 1 }}
        >
          Copy all
        </Button>
      </Box>
      <Typography
        data-testid={`${outcome}-notes`}
        variant="body2"
        color={notes ? "text.primary" : "text.secondary"}
        sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {notes || `No notes recorded for ${outcome} trades.`}
      </Typography>
    </Paper>
  );
}

export default function TradeOutcomeEvaluationSection({
  history,
  outcome,
}: {
  history: SlowTradingReportRow[];
  outcome: TradeOutcome;
}) {
  const outcomeLabel = outcome === "loss" ? "Loss" : "Profit";
  const coinCounts = buildEvaluationCounts(history, (trade) => trade.symbol);
  const exitReasonCounts = buildEvaluationCounts(history, (trade) =>
    (trade.closed?.reason ?? "UNKNOWN").replaceAll("_", " "),
  );
  const notes = buildEvaluationNotes(history);
  const emptyMessage = `No ${outcome} trades to chart.`;

  return (
    <Grid container spacing={1} sx={{ mb: 2 }}>
      <Grid size={{ xs: 12, md: 4 }}>
        <EvaluationNotesCard notes={notes} outcome={outcome} />
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <EvaluationCountPieCard
          counts={coinCounts}
          emptyMessage={emptyMessage}
          title={`${outcomeLabel} count by coin`}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <EvaluationCountPieCard
          counts={exitReasonCounts}
          emptyMessage={emptyMessage}
          title={`${outcomeLabel} count by exit reason`}
        />
      </Grid>
    </Grid>
  );
}
