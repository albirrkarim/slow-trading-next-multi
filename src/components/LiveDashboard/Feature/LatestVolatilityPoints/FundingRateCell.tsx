import type { UnifiedFundingRate } from "@/lib/exchange";
import { TableCell, Tooltip, Typography } from "@mui/material";
import moment from "moment-timezone";

/** Formats a decimal funding rate as a signed percentage. */
export function formatFundingRatePct(rate: number | undefined) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";

  const pct = rate * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(4)}%`;
}

/** Describes which side pays at the supplied funding rate. */
export function describeFundingRatePayer(rate: number | undefined) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "Unavailable";
  if (rate < 0) return "SHORT pays";
  if (rate > 0) return "LONG pays";
  return "No funding payment";
}

/** Formats Binance's funding snapshot timestamp for the secondary label. */
export function formatFundingRateUpdatedAt(t: number | undefined) {
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) {
    return "Updated: unknown";
  }

  return `Updated ${moment(t).format("DD MMM YYYY HH:mm")}`;
}

function getFundingRateColor(rate: number | undefined) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return undefined;
  if (rate < 0) return "error.main";
  if (rate > 0) return "success.main";
  return undefined;
}

export default function FundingRateCell({
  fundingRate,
}: {
  fundingRate?: UnifiedFundingRate;
}) {
  const payer = describeFundingRatePayer(fundingRate?.rate);
  const tooltip =
    fundingRate?.rate == null
      ? "Funding-rate data is available for supported perpetual-futures markets."
      : `${payer}. A negative rate means SHORT positions pay LONG positions.`;

  return (
    <TableCell sx={{ minWidth: 155, verticalAlign: "top" }}>
      <Tooltip title={tooltip}>
        <Typography
          color={getFundingRateColor(fundingRate?.rate)}
          fontWeight={700}
          variant="h6"
        >
          {/* PROD:LATEST_VOLATILITY_FUNDING_RATE */}
          {formatFundingRatePct(fundingRate?.rate)}
        </Typography>
      </Tooltip>
      <Typography color="text.secondary" display="block" variant="caption">
        {payer}
      </Typography>
      <Typography color="text.secondary" display="block" variant="caption">
        {formatFundingRateUpdatedAt(fundingRate?.t)}
      </Typography>
    </TableCell>
  );
}
