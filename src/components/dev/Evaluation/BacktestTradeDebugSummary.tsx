"use client";

import { Box, Typography } from "@mui/material";

import PositionLevelSequence, {
  buildHistoryPositionLevelSequence,
} from "@/components/LiveDashboard/Shared/PositionLevelSequence";
import type { Position, PositionAveragingExecution } from "@/lib/trading/models";

/** Formats a persisted averaging multiplier for compact debug output. */
function formatMultiplier(execution: PositionAveragingExecution): string {
  const multiplier =
    typeof execution.adaptiveMultiplier === "number" &&
    Number.isFinite(execution.adaptiveMultiplier) &&
    execution.adaptiveMultiplier > 0
      ? execution.adaptiveMultiplier
      : execution.allocationPct;

  return Number.isFinite(multiplier)
    ? `${Number(multiplier.toFixed(2))}x`
    : "—";
}

/** Formats a finite price without forcing unnecessary trailing zeroes. */
function formatPrice(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(8)).toString() : "—";
}

/** Builds one human-readable line from a persisted averaging execution. */
function formatAveragingRecord(
  execution: PositionAveragingExecution,
  index: number,
): string {
  const optionalDetails = [
    typeof execution.reservedMarginUsdt === "number" &&
    Number.isFinite(execution.reservedMarginUsdt)
      ? `reserved $${execution.reservedMarginUsdt.toFixed(2)}`
      : null,
    typeof execution.projectedProfitPct === "number" &&
    Number.isFinite(execution.projectedProfitPct)
      ? `projected ${execution.projectedProfitPct >= 0 ? "+" : ""}${execution.projectedProfitPct.toFixed(2)}%`
      : null,
  ].filter(Boolean);

  return [
    `#${index + 1}`,
    `L${Math.abs(execution.level)}`,
    formatMultiplier(execution),
    `margin $${execution.marginUsdt.toFixed(2)}`,
    `price ${formatPrice(execution.price)}`,
    ...optionalDetails,
    new Date(execution.t).toLocaleString(),
  ].join(" · ");
}

export default function BacktestTradeDebugSummary({
  position,
}: {
  position: Position;
}) {
  const executions = [...(position.strategy.averaging.executions ?? [])].sort(
    (left, right) => left.t - right.t,
  );

  return (
    <Box
      aria-label="Backtest trade averaging details"
      sx={{
        bgcolor: "action.hover",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        display: "grid",
        gap: 1,
        p: 1,
        width: "100%",
      }}
    >
      <Box>
        <Typography component="div" variant="body2">
          <strong>Averaging:</strong>{" "}
          {executions.length === 0
            ? "Not averaged"
            : `${executions.length} execution${executions.length === 1 ? "" : "s"}`}
        </Typography>

        {executions.length > 0 && (
          <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {executions.map((execution, index) => (
              <Typography
                component="li"
                key={`${execution.t}-${execution.level}-${index}`}
                sx={{
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                  overflowWrap: "anywhere",
                }}
                variant="caption"
              >
                {formatAveragingRecord(execution, index)}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          minWidth: 0,
        }}
      >
        <Typography component="div" sx={{ fontWeight: 700 }} variant="body2">
          Level sequence:
        </Typography>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          {/* BOTH:REUSABLE_LEVEL_SEQUENCE */}
          <PositionLevelSequence
            items={buildHistoryPositionLevelSequence(position)}
            showTargetAlert={false}
          />
        </Box>
      </Box>
    </Box>
  );
}
