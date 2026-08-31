"use client";

import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Alert, Box, Chip, Tooltip } from "@mui/material";

import type { Position } from "@/lib/trading/models";

export type PositionLevelSequenceState =
  | "current"
  | "exit"
  | "passed"
  | "reserved"
  | "skipped"
  | "target"
  | "unreserved";
export type PositionLevelSequenceReserveStatus =
  | "RELEASED"
  | "RESERVED"
  | "UNRESERVED"
  | "USED";
export type PositionLevelSequenceCoverage = "full" | "none" | "partial";

export interface PositionLevelSequenceItem {
  averagingMultiplier?: number;
  coveredMarginUsdt: number;
  driftPct?: number;
  isAveraged: boolean;
  isEntry: boolean;
  isExit?: boolean;
  level: number;
  marginUsdt?: number;
  reserveStatus?: PositionLevelSequenceReserveStatus;
  state: PositionLevelSequenceState;
  unreservedCoverage?: PositionLevelSequenceCoverage;
}

const stateLabels: Record<PositionLevelSequenceState, string> = {
  current: "Current",
  exit: "Exit",
  passed: "Passed",
  reserved: "Reserved",
  skipped: "Not averaged",
  target: "Target vPoint hit",
  unreserved: "Unreserved",
};

function levelKey(level: number): number {
  return Math.abs(level);
}

/** Checks whether the latest reached level still has no averaging execution. */
function isReachedWithoutAveraging(
  item: PositionLevelSequenceItem,
  averagingStopped = false,
) {
  return (
    !averagingStopped &&
    item.state === "current" &&
    !item.isEntry &&
    !item.isAveraged
  );
}

/** Formats a finite profit-direction drift percentage. */
function formatDriftPct(driftPct?: number) {
  if (typeof driftPct !== "number" || !Number.isFinite(driftPct)) {
    return null;
  }

  return `${driftPct > 0 ? "+" : ""}${driftPct.toFixed(2)}%`;
}

/** Formats the actual multiplier persisted for an averaging execution. */
function formatAveragingMultiplier(multiplier?: number) {
  if (
    typeof multiplier !== "number" ||
    !Number.isFinite(multiplier) ||
    multiplier <= 0
  ) {
    return null;
  }

  return `${Number(multiplier.toFixed(2))}x`;
}

/** Resolves the chip color and variant for a sequence item. */
function getChipProps(
  item: PositionLevelSequenceItem,
  averagingStopped: boolean,
) {
  switch (item.state) {
    case "current":
      return {
        color: isReachedWithoutAveraging(item, averagingStopped)
          ? ("warning" as const)
          : ("primary" as const),
        variant: "filled" as const,
      };
    case "exit":
      return { color: "info" as const, variant: "filled" as const };
    case "passed":
      return { color: "default" as const, variant: "outlined" as const };
    case "reserved":
      return { color: "success" as const, variant: "outlined" as const };
    case "skipped":
      return { color: "warning" as const, variant: "outlined" as const };
    case "target":
      return { color: "error" as const, variant: "filled" as const };
    default:
      return {
        color:
          item.unreservedCoverage === "full"
            ? ("success" as const)
            : item.unreservedCoverage === "partial"
              ? ("warning" as const)
              : ("default" as const),
        variant: "outlined" as const,
      };
  }
}

/** Formats how much of an unreserved step has spendable coverage. */
function formatCoverage(item: PositionLevelSequenceItem): string | null {
  if (
    item.reserveStatus !== "UNRESERVED" ||
    typeof item.marginUsdt !== "number" ||
    !Number.isFinite(item.marginUsdt) ||
    item.marginUsdt < 0
  ) {
    return null;
  }

  const coveragePct =
    item.marginUsdt === 0
      ? 100
      : Math.min(
          100,
          Math.max(0, (item.coveredMarginUsdt / item.marginUsdt) * 100),
        );
  const formattedPct = Number.isInteger(coveragePct)
    ? coveragePct.toFixed(0)
    : coveragePct.toFixed(1);

  return `Coverage ${formattedPct}% ($${item.coveredMarginUsdt.toFixed(2)} of $${item.marginUsdt.toFixed(2)})`;
}

/** Builds the hover explanation for one sequence chip. */
function buildTooltip(
  item: PositionLevelSequenceItem,
  averagingStopped: boolean,
  reserveMultiplier: number,
): string {
  const details = [
    `Level ${levelKey(item.level)}`,
    stateLabels[item.state],
    item.isEntry ? "Entry" : null,
    item.isAveraged ? "Averaged" : null,
    item.isAveraged && formatAveragingMultiplier(item.averagingMultiplier)
      ? `${
          item.averagingMultiplier! > reserveMultiplier
            ? "Adaptive averaging"
            : "Averaging"
        } multiplier ${formatAveragingMultiplier(item.averagingMultiplier)}`
      : null,
    isReachedWithoutAveraging(item, averagingStopped)
      ? "Level reached without averaging"
      : null,
    isReachedWithoutAveraging(item, averagingStopped) &&
    formatDriftPct(item.driftPct)
      ? `Profit-direction drift ${formatDriftPct(item.driftPct)} from the current level vPoint to mark price`
      : null,
    item.state === "skipped" ? "Level was reached without averaging" : null,
    item.state === "target" ? "Remaining averaging steps stopped" : null,
    item.reserveStatus === "RESERVED" ? "Reserved watch step" : null,
    item.reserveStatus === "UNRESERVED" ? "Unreserved watch step" : null,
    formatCoverage(item),
    item.reserveStatus !== "UNRESERVED" &&
    typeof item.marginUsdt === "number"
      ? `Margin $${item.marginUsdt.toFixed(2)}`
      : null,
  ];

  return details.filter(Boolean).join(" | ");
}

/** Builds the persisted entry, averaging, and exit path for a closed trade. */
export function buildHistoryPositionLevelSequence(
  position: Position,
): PositionLevelSequenceItem[] {
  // BOTH:REUSABLE_LEVEL_SEQUENCE
  const entryLevel = Number(position.opened.vPoint.lvl);
  const executions = [...(position.strategy.averaging.executions ?? [])].sort(
    (left, right) => left.t - right.t,
  );

  if (position.vPoints !== undefined && Number.isFinite(entryLevel)) {
    // BOTH:POSITION_VPOINT_PATH
    const exitId = position.closed?.vPoint?.id;
    const intermediatePoints = position.vPoints.filter(
      (point) =>
        Number.isFinite(point.lvl) &&
        point.id !== position.opened.vPoint.id &&
        point.id !== exitId,
    );
    const executionByLevel = new Map(
      executions
        .filter((execution) => Number.isFinite(execution.level))
        .map((execution) => [execution.level, execution]),
    );
    const items: PositionLevelSequenceItem[] = [
      {
        coveredMarginUsdt: 0,
        isAveraged: false,
        isEntry: true,
        level: entryLevel,
        state: "passed",
      },
    ];

    for (const point of intermediatePoints) {
      const execution = executionByLevel.get(point.lvl);
      const isAveraged = execution !== undefined;
      const isAdverseLevel =
        position.direction === "LONG" ? point.lvl < 0 : point.lvl > 0;
      const isDeeperThanEntry =
        Math.abs(point.lvl) > Math.abs(entryLevel);

      items.push({
        averagingMultiplier: execution?.allocationPct,
        coveredMarginUsdt: 0,
        isAveraged,
        isEntry: false,
        level: point.lvl,
        marginUsdt: execution?.marginUsdt,
        reserveStatus: isAveraged ? "USED" : undefined,
        state:
          !isAveraged && isAdverseLevel && isDeeperThanEntry
            ? "skipped"
            : "passed",
      });
    }

    const exitLevel = Number(position.closed?.vPoint?.lvl);
    if (Number.isFinite(exitLevel)) {
      const isTargetExit =
        position.closed?.reason === "VOLATILITY_TARGET_TP" ||
        position.closed?.reason === "VOLATILITY_TARGET_SL";
      items.push({
        coveredMarginUsdt: 0,
        isAveraged: false,
        isEntry: false,
        isExit: true,
        level: exitLevel,
        state: isTargetExit ? "target" : "exit",
      });
    }

    return items;
  }

  const items: PositionLevelSequenceItem[] = Number.isFinite(entryLevel)
    ? [
        {
          coveredMarginUsdt: 0,
          isAveraged: false,
          isEntry: true,
          level: entryLevel,
          state: "passed",
        },
      ]
    : [];
  for (const execution of executions) {
    if (!Number.isFinite(execution.level)) {
      continue;
    }

    items.push({
      averagingMultiplier: execution.allocationPct,
      coveredMarginUsdt: 0,
      isAveraged: true,
      isEntry: false,
      level: execution.level,
      marginUsdt: execution.marginUsdt,
      reserveStatus: "USED",
      state: "passed",
    });
  }

  const exitLevel = Number(position.closed?.vPoint?.lvl);
  if (Number.isFinite(exitLevel)) {
    const isTargetExit =
      position.closed?.reason === "VOLATILITY_TARGET_TP" ||
      position.closed?.reason === "VOLATILITY_TARGET_SL";
    items.push({
      coveredMarginUsdt: 0,
      isAveraged: false,
      isEntry: false,
      isExit: true,
      level: exitLevel,
      state: isTargetExit ? "target" : "exit",
    });
  }

  return items;
}

/** Shared chip renderer for open-position and closed-trade level sequences. */
export default function PositionLevelSequence({
  items,
  reserveMultiplier = 2,
  showTargetAlert = true,
}: {
  items: PositionLevelSequenceItem[];
  reserveMultiplier?: number;
  showTargetAlert?: boolean;
}) {
  // BOTH:REUSABLE_LEVEL_SEQUENCE
  const targetWasHit = items.some((item) => item.state === "target");

  if (items.length === 0) {
    return null;
  }

  return (
    <Box sx={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 1 }}>
      <Box
        aria-label="Position level sequence"
        sx={{
          alignItems: "center",
          display: "flex",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "auto",
        }}
      >
        {items.map((item, index) => {
          const chipProps = getChipProps(item, targetWasHit);
          const reachedWithoutAveraging = isReachedWithoutAveraging(
            item,
            targetWasHit,
          );
          const driftLabel = formatDriftPct(item.driftPct);
          const averagingMultiplierLabel = formatAveragingMultiplier(
            item.averagingMultiplier,
          );
          const statusLabel = [
            `Level ${levelKey(item.level)}`,
            stateLabels[item.state],
            item.isEntry ? "Entry" : null,
            item.isExit && item.state !== "exit" ? "Exit" : null,
            item.isAveraged ? "Averaged" : null,
            reachedWithoutAveraging ? "Not averaged" : null,
            reachedWithoutAveraging && driftLabel
              ? `Drift ${driftLabel}`
              : null,
            item.state === "unreserved"
              ? item.unreservedCoverage === "full"
                ? "Fully covered"
                : item.unreservedCoverage === "partial"
                  ? "Partially covered"
                  : "Not covered"
              : null,
          ]
            .filter(Boolean)
            .join(", ");
          const chipSuffix = item.isAveraged
            ? ` AVG${
                averagingMultiplierLabel ? ` ${averagingMultiplierLabel}` : ""
              }`
            : item.isExit || item.state === "exit"
              ? " EXIT"
              : item.state === "skipped"
                ? " NOT AVG"
                : reachedWithoutAveraging && driftLabel
                  ? ` drift ${driftLabel}`
                  : "";

          return (
            <Box
              key={`${item.level}-${index}`}
              sx={{ alignItems: "center", display: "flex", flexShrink: 0 }}
            >
              {index > 0 && (
                <ArrowForwardRoundedIcon
                  aria-hidden
                  sx={{ color: "text.disabled", fontSize: 14, mx: 0.25 }}
                />
              )}
              <Tooltip
                arrow
                placement="top"
                title={buildTooltip(item, targetWasHit, reserveMultiplier)}
              >
                <Chip
                  {...chipProps}
                  aria-label={statusLabel}
                  label={`L${levelKey(item.level)}${chipSuffix}`}
                  size="small"
                  sx={{
                    borderStyle:
                      item.state === "unreserved" ? "dashed" : "solid",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    height: 18,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {showTargetAlert && targetWasHit && (
        <Alert
          aria-label="Averaging sequence stopped"
          icon={<WarningAmberRoundedIcon fontSize="inherit" />}
          severity="warning"
          variant="outlined"
          sx={{
            alignItems: "center",
            fontSize: "0.65rem",
            fontWeight: 700,
            minHeight: 22,
            py: 0,
            px: 0.75,
            "& .MuiAlert-icon": { mr: 0.5, py: 0 },
            "& .MuiAlert-message": { py: 0.25 },
          }}
        >
          Target vPoint hit; remaining averaging steps stopped
        </Alert>
      )}
    </Box>
  );
}
