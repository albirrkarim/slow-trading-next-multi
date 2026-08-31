"use client";

import { Chip, Tooltip } from "@mui/material";

export default function CoinHealthScore({
  reasons,
  score,
}: {
  reasons: string[];
  score: number | null;
}) {
  const color =
    score === null
      ? "default"
      : score >= 70
        ? "success"
        : score >= 45
          ? "warning"
          : "error";

  return (
    <Tooltip
      arrow
      placement="right"
      title={reasons.join("\n") || "Health score unavailable"}
      slotProps={{
        tooltip: { sx: { whiteSpace: "pre-line", maxWidth: 440 } },
      }}
    >
      <Chip
        color={color}
        label={score === null ? "—" : `${score} / 100`}
        size="small"
        variant="outlined"
      />
    </Tooltip>
  );
}
