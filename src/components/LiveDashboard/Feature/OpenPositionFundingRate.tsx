"use client";

import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { Box, Tooltip, Typography } from "@mui/material";
import moment from "moment-timezone";

import type {
  PositionDirection,
  PositionFundingSnapshot,
} from "@/lib/trading/models";
import { formatFundingRatePct } from "./LatestVolatilityPoints/FundingRateCell";

/** Describes whether this open position would pay or receive funding. */
export function describePositionFundingImpact(
  direction: PositionDirection,
  rate: number | undefined,
) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return "Funding unavailable";
  }
  if (rate === 0) return "No funding payment";

  const pays =
    (rate > 0 && direction === "LONG") ||
    (rate < 0 && direction === "SHORT");
  return `${direction} ${pays ? "pays" : "receives"}`;
}

/** Builds the plain-language explanation shown for persisted funding data. */
export function buildOpenPositionFundingTooltip(params: {
  direction: PositionDirection;
  funding?: PositionFundingSnapshot;
}) {
  const { direction, funding } = params;
  if (!funding) {
    return "Funding snapshot unavailable. Funding applies only to perpetual futures and is refreshed by open-position monitoring.";
  }

  const crowdedSide =
    funding.rate > 0 ? "LONG" : funding.rate < 0 ? "SHORT" : "neither side";
  const impact = describePositionFundingImpact(direction, funding.rate);
  const updated = moment(funding.t).format("DD MMM YYYY HH:mm");
  const nextFunding = funding.nextT
    ? moment(funding.nextT).format("DD MMM YYYY HH:mm")
    : "unknown";

  return (
    `Latest ${funding.exchange} perpetual-futures funding snapshot. ` +
    `Think of it as which side is more crowded: this rate suggests ${crowdedSide}. ` +
    `Positive means LONG pays SHORT; negative means SHORT pays LONG. ` +
    `This position: ${impact} if it remains open at settlement. ` +
    `Updated ${updated}; next funding ${nextFunding}.`
  );
}

export default function OpenPositionFundingRate({
  direction,
  funding,
}: {
  direction: PositionDirection;
  funding?: PositionFundingSnapshot;
}) {
  const impact = describePositionFundingImpact(direction, funding?.rate);
  const tooltip = buildOpenPositionFundingTooltip({ direction, funding });
  const pays = impact.endsWith("pays");
  const receives = impact.endsWith("receives");

  return (
    <Tooltip arrow enterTouchDelay={0} placement="top" title={tooltip}>
      <Box
        aria-label={tooltip}
        tabIndex={0}
        sx={{
          borderRadius: 0.5,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        <Typography
          color="text.secondary"
          sx={{
            alignItems: "center",
            display: "flex",
            fontSize: "0.7rem",
            gap: 0.5,
          }}
          variant="caption"
        >
          Funding Rate
          <HelpOutlineIcon aria-hidden sx={{ fontSize: 14 }} />
        </Typography>
        <Typography
          color={pays ? "error.main" : receives ? "success.main" : undefined}
          sx={{ fontSize: "0.85rem", fontWeight: "bold" }}
          variant="body2"
        >
          {/* PROD:OPEN_POSITION_FUNDING_RATE_UI */}
          {formatFundingRatePct(funding?.rate)}
        </Typography>
        <Typography color="text.secondary" display="block" variant="caption">
          {impact}
        </Typography>
      </Box>
    </Tooltip>
  );
}
