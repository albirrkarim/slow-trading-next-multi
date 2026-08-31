"use client";

import { Chip, Tooltip } from "@mui/material";

export default function CoinCorrelationScore({
  correlations,
  score,
}: {
  correlations: Record<string, number>;
  score: number | null;
}) {
  const detail = Object.entries(correlations)
    .sort((left, right) => right[1] - left[1])
    .map(([symbol, correlation]) => `${symbol} [${correlation.toFixed(2)}]`)
    .join(", ");

  return (
    <Tooltip
      arrow
      placement="right"
      title={detail || "No comparable correlation scores"}
    >
      <Chip
        color={score === null ? "default" : "primary"}
        label={score?.toFixed(3) ?? "—"}
        size="small"
        variant="outlined"
      />
    </Tooltip>
  );
}
