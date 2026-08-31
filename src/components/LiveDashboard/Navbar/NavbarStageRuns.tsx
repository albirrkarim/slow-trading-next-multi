"use client";

import { Fragment, useState } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import {
  Box,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import moment from "moment";

import slowTradingStages from "@/lib/slowTrading/stages";
import type {
  SlowTradingDashboardState,
  SlowTradingStage,
  SlowTradingStageRunStats,
} from "@/lib/slowTrading/types";

const STAGE_LABELS: Record<SlowTradingStage, string> = {
  "risk-sentinel": "Risk Sentinel",
  speedup: "Speedup",
  "standard-monitoring": "Standard Monitoring",
  management: "Management",
  "capture-entry": "Capture Entry",
};

/** Formats a stage duration for the compact navbar display. */
function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return "";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Converts a persisted profiler section key into a compact UI label. */
function formatSectionLabel(section: string) {
  return section
    .replace(/^cycle\./, "")
    .replace(/^signals\./, "signals ")
    .replace(/^storage\./, "storage ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/** Formats a result count with a singular or plural label. */
function formatCount(value: number, singular: string) {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

/** Selects the latest stage run, falling back to the legacy full-cycle fields. */
function getLatestRun(
  dashboardState: SlowTradingDashboardState,
): Pick<SlowTradingStageRunStats, "t" | "ms"> | null {
  const stageRuns = Object.values(dashboardState.stats.stageRuns ?? {}).filter(
    (run): run is SlowTradingStageRunStats => Boolean(run),
  );
  const latestStageRun = stageRuns.sort((left, right) => right.t - left.t)[0];
  const legacyRun = dashboardState.stats.lastRunAt
    ? {
        t: dashboardState.stats.lastRunAt,
        ms: dashboardState.stats.lastRunDurationMs ?? 0,
      }
    : null;

  if (!latestStageRun) {
    return legacyRun;
  }
  if (!legacyRun || latestStageRun.t >= legacyRun.t) {
    return latestStageRun;
  }

  return legacyRun;
}

/** Formats the newest completed run across stage and legacy cycle records. */
function formatLastRunLabel(dashboardState: SlowTradingDashboardState) {
  const latestRun = getLatestRun(dashboardState);
  if (!latestRun) {
    return "Last run: Never";
  }

  const duration = formatDuration(latestRun.ms);
  const runDate = moment(latestRun.t).format("D - MMM HH:mm");
  return [`Last run: ${runDate}`, duration ? `(${duration})` : ""]
    .filter(Boolean)
    .join(" ");
}

function StagePerformanceTable({ run }: { run: SlowTradingStageRunStats }) {
  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Typography display="block" sx={{ mb: 0.5 }} variant="caption">
        {run.summary}
      </Typography>
      {run.performance.sections.length > 0 ? (
        <Table
          aria-label="Stage performance breakdown"
          padding="none"
          size="small"
        >
          <TableBody>
            {run.performance.sections.map((section) => (
              <TableRow key={section.s}>
                <TableCell sx={{ border: 0, py: 0.25 }}>
                  <Typography variant="caption">
                    {formatSectionLabel(section.s)}
                    {section.n > 1 ? ` x${section.n}` : ""}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ border: 0, py: 0.25 }}>
                  <Typography
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                    variant="caption"
                  >
                    {formatDuration(section.ms)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Typography display="block" sx={{ opacity: 0.75 }} variant="caption">
          No timed work was needed for this pass.
        </Typography>
      )}
    </Box>
  );
}

function StageRunsTable({
  dashboardState,
}: {
  dashboardState: SlowTradingDashboardState;
}) {
  const [expandedStage, setExpandedStage] = useState<SlowTradingStage | null>(
    null,
  );

  return (
    <Box
      sx={{
        color: "common.white",
        maxHeight: "min(70vh, 560px)",
        overflowY: "auto",
        "& .MuiIconButton-root": {
          color: "inherit",
        },
        "& .MuiIconButton-root.Mui-disabled": {
          color: "rgba(255, 255, 255, 0.38)",
        },
        "& .MuiTableCell-root": {
          borderColor: "rgba(255, 255, 255, 0.7)",
          color: "inherit",
        },
      }}
    >
      <Typography sx={{ fontWeight: 700, mb: 0.5 }} variant="body2">
        Scheduled stage runs
      </Typography>
      <Table aria-label="Scheduled stage runs" padding="none" size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ pr: 1 }}>Stage</TableCell>
            <TableCell sx={{ px: 1 }}>Last run</TableCell>
            <TableCell align="right" sx={{ px: 1 }}>
              Time
            </TableCell>
            <TableCell align="right" sx={{ pl: 1 }}>
              Result
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {slowTradingStages.order.map((stage) => {
            const run = dashboardState.stats.stageRuns?.[stage];
            const isExpanded = expandedStage === stage;
            const label = STAGE_LABELS[stage];

            return (
              <Fragment key={stage}>
                <TableRow hover>
                  <TableCell sx={{ pr: 1, whiteSpace: "nowrap" }}>
                    <Box sx={{ alignItems: "center", display: "flex" }}>
                      <IconButton
                        aria-label={`${isExpanded ? "Hide" : "Show"} ${label} performance`}
                        disabled={!run}
                        onClick={() =>
                          setExpandedStage(isExpanded ? null : stage)
                        }
                        size="small"
                      >
                        {isExpanded ? (
                          <KeyboardArrowDownIcon fontSize="inherit" />
                        ) : (
                          <KeyboardArrowRightIcon fontSize="inherit" />
                        )}
                      </IconButton>
                      <Typography variant="caption">{label}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ px: 1, whiteSpace: "nowrap" }}>
                    <Typography variant="caption">
                      {run ? moment(run.t).format("D MMM HH:mm") : "Never"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ px: 1 }}>
                    <Typography variant="caption">
                      {run ? formatDuration(run.ms) : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ pl: 1, whiteSpace: "nowrap" }}>
                    <Typography variant="caption">
                      {run
                        ? `${formatCount(run.reports, "report")} / ${formatCount(run.symbols, "coin")}`
                        : "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
                {run && isExpanded && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ p: 0 }}>
                      <StagePerformanceTable run={run} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <Typography display="block" sx={{ mt: 0.75, opacity: 0.75 }} variant="caption">
        Result shows execution reports / eligible coins. Expand a stage for its
        timing breakdown.
      </Typography>
    </Box>
  );
}

/** Navbar chip and interactive table for independently scheduled stage runs. */
export default function NavbarStageRuns({
  dashboardState,
}: {
  dashboardState: SlowTradingDashboardState;
}) {
  return (
    // PROD:STAGE_RUN_STATS
    <Tooltip
      arrow
      placement="bottom-start"
      slotProps={{ tooltip: { sx: { maxWidth: 620, p: 1.25 } } }}
      title={<StageRunsTable dashboardState={dashboardState} />}
    >
      <Chip
        color="default"
        label={formatLastRunLabel(dashboardState)}
        size="small"
        sx={{
          mt: 0.5,
          maxWidth: "100%",
          "& .MuiChip-label": {
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }}
        variant="outlined"
      />
    </Tooltip>
  );
}
