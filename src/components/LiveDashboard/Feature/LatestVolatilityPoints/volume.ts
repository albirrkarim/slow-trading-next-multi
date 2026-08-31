import { orange, red } from "@mui/material/colors";

const DEFAULT_MAX_ENTRY_VOLUME_PCT = 0.2;
const LOW_VOLUME_24H_THRESHOLD = 1_000_000;
const VERY_LOW_VOLUME_24H_THRESHOLD = 500_000;
const CLOSE_TO_WORKER_COST_MULTIPLIER = 1.25;

function resolveMaxEntryVolumePct(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : DEFAULT_MAX_ENTRY_VOLUME_PCT;
}

function formatPct(value: number) {
  return `${Number(value.toFixed(4))}%`;
}

/**
 * Estimates a maximum entry notional from 24h quote volume.
 *
 * The value is a UI liquidity-risk estimate, not an exchange order-book depth
 * guarantee. The default uses 0.2% of 24h quote volume.
 */
export function estimateMaxEntryFromVolume24h({
  maxEntryBased24HourVolPct,
  volume24h,
}: {
  maxEntryBased24HourVolPct?: number;
  volume24h: number | undefined;
}) {
  const pct = resolveMaxEntryVolumePct(maxEntryBased24HourVolPct);
  if (
    volume24h === undefined ||
    !Number.isFinite(volume24h) ||
    volume24h <= 0 ||
    !Number.isFinite(pct) ||
    pct <= 0
  ) {
    return undefined;
  }

  return volume24h * (pct / 100);
}

/** Formats a quote-volume value compactly for the volatility card. */
export function formatVolume24h(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: "compact",
    style: "currency",
  }).format(value);
}

/** Builds the liquidity-estimate explanation shown on the card tooltip. */
export function buildMaxEntryVolumeTooltip(params: {
  estimatedMaxEntry?: number;
  maxEntryBased24HourVolPct?: number;
  volume24h?: number;
  workerCostUsdt?: number;
}) {
  const pct = resolveMaxEntryVolumePct(params.maxEntryBased24HourVolPct);
  const pctText = formatPct(pct);
  const volume = formatVolume24h(params.volume24h);
  const maxEntry = formatVolume24h(params.estimatedMaxEntry);
  const workerCost = formatVolume24h(params.workerCostUsdt);
  const configuredLine =
    pct > 0
      ? `Configured cap: config.maxEntryBased24HourVolPct = ${pctText}.`
      : "Configured cap is disabled because config.maxEntryBased24HourVolPct = 0.";

  return [
    "Estimated max entry budget from 24h quote volume.",
    configuredLine,
    pct > 0
      ? `Formula: 24h volume × ${pctText} = estimated sizing budget.`
      : undefined,
    pct > 0 ? `This coin: ${volume} × ${pctText} = ${maxEntry}.` : undefined,
    "SLOW uses this as the temporary budget for entry + reserve planning.",
    pct > 0 && params.workerCostUsdt !== undefined
      ? `Worker cost: ${workerCost}. Red when worker cost is above estimated max entry; orange when it is within 25%.`
      : undefined,
    "Reference: 0.1% safe, 0.2% default/conservative, 0.3% normal, 0.5% aggressive, 1% very aggressive.",
    pct > 0
      ? `Examples at ${pctText}: ${formatVolume24h(1_000_000)} → ${formatVolume24h(
          1_000_000 * (pct / 100),
        )}, ${formatVolume24h(5_000_000)} → ${formatVolume24h(
          5_000_000 * (pct / 100),
        )}, ${formatVolume24h(10_000_000)} → ${formatVolume24h(
          10_000_000 * (pct / 100),
        )}.`
      : undefined,
    "This is volume-only guidance. Order-book depth with slippage would be better.",
  ].filter(Boolean).join("\n");
}

/** Identifies low-liquidity cards using the requested $1M quote-volume cutoff. */
export function isLowVolume24h(value: number | undefined) {
  if (value === undefined) {
    return true;
  }

  if (!Number.isFinite(value)) return false;

  return value < LOW_VOLUME_24H_THRESHOLD;
}

/** Identifies very-low-liquidity cards using the requested $500K quote-volume cutoff. */
export function isVeryLowVolume24h(value: number | undefined) {
  if (value === undefined) {
    return true;
  }

  if (!Number.isFinite(value)) return false;

  return value < VERY_LOW_VOLUME_24H_THRESHOLD;
}

/**
 * Color rule:
 * - Below $500K = red
 * - Below $1M = orange
 * - $1M and above = normal text color
 */
export function getVolume24hRiskColor(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return red[600];
  }

  if (value < VERY_LOW_VOLUME_24H_THRESHOLD) {
    return red[600];
  }

  if (value < LOW_VOLUME_24H_THRESHOLD) {
    return orange[700];
  }

  return "text.secondary";
}

/** Colors max-entry liquidity against the real cost of opening one worker. */
export function getEstimatedMaxEntryRiskColor({
  estimatedMaxEntry,
  workerCostUsdt,
}: {
  estimatedMaxEntry?: number;
  workerCostUsdt: number;
}) {
  if (
    estimatedMaxEntry === undefined ||
    !Number.isFinite(estimatedMaxEntry) ||
    estimatedMaxEntry <= 0
  ) {
    return red[600];
  }

  if (workerCostUsdt > estimatedMaxEntry) {
    return red[600];
  }

  if (workerCostUsdt * CLOSE_TO_WORKER_COST_MULTIPLIER > estimatedMaxEntry) {
    return orange[700];
  }

  return "text.secondary";
}
