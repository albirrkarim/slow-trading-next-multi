"use client";

import RangedValueText, {
  type RangedValueColorRange,
} from "@/components/LiveDashboard/Reporting/RangedValueText";
import { Box } from "@mui/material";
import { green, red } from "@mui/material/colors";

import type { VolatilityPointLabelFrequency } from "./types";

const PIVOT_SHARE_COLOR_RANGES: RangedValueColorRange[] = [
  { color: "error.main", max: 30 },
  { color: "warning.main", max: 40, min: 30 },
];

function formatLabelPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0.0%";

  return `${value.toFixed(1)}%`;
}

function toBarPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export default function VolatilityPointLabelFrequencyBar({
  frequency,
  width = 150,
}: {
  frequency: VolatilityPointLabelFrequency;
  width?: number | string;
}) {
  const topBarPct = toBarPercent(frequency.topPct);
  const downBarPct = toBarPercent(frequency.downPct);

  return (
    <Box sx={{ mt: 0.5, width }}>
      <Box
        aria-label={`T ${formatLabelPercent(frequency.topPct)}, B ${formatLabelPercent(frequency.downPct)}`}
        sx={{
          bgcolor: "action.hover",
          borderRadius: 999,
          display: "flex",
          height: 6,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <Box sx={{ bgcolor: green[500], width: `${topBarPct}%` }} />
        <Box sx={{ bgcolor: red[500], width: `${downBarPct}%` }} />
      </Box>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          mt: 0.25,
        }}
      >
        <RangedValueText
          component="span"
          fallbackColor="text.secondary"
          formatValue={(value) => `T: ${formatLabelPercent(value)}`}
          ranges={PIVOT_SHARE_COLOR_RANGES}
          value={frequency.topPct}
          variant="caption"
        />
        <RangedValueText
          component="span"
          fallbackColor="text.secondary"
          formatValue={(value) => `B: ${formatLabelPercent(value)}`}
          ranges={PIVOT_SHARE_COLOR_RANGES}
          value={frequency.downPct}
          variant="caption"
        />
      </Box>
    </Box>
  );
}
