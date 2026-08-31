"use client";

import { Chip, Tooltip } from "@mui/material";

export default function NavbarVolatilityThreshold({
  volatilityThresholdPct,
}: {
  volatilityThresholdPct: number;
}) {
  const formattedThreshold = Number.isFinite(volatilityThresholdPct)
    ? `${volatilityThresholdPct}%`
    : "Unavailable";

  return (
    <Tooltip
      arrow
      placement="bottom-start"
      title="Global price-move threshold used to form volatility points."
    >
      <Chip
        aria-label={`Global volatility threshold: ${formattedThreshold}`}
        color="default"
        label={`Vol: ${formattedThreshold}`}
        size="small"
        variant="outlined"
      />
    </Tooltip>
  );
}
