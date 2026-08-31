"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  CircularProgress,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import { endpoints } from "@/components/endpoints";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import TypographyTooltip from "@/components/ui/TypographyTooltip";
import type {
  SlowTradingDashboardState,
  SlowTradingManualQueueCreateInput,
  SlowTradingQueues,
  SlowTradingSafeHavenQueueItem,
  SlowTradingWithdrawalQueueItem,
} from "@/lib/slowTrading";
import slowTradingWithdrawalSchedule from "@/lib/slowTrading/withdrawal-schedule";
import slowTradingSafeHavenSchedule from "@/lib/slowTrading/safe-haven-schedule";

import {
  SlowTradingErrorLogs,
  SlowTradingManagementLogs,
  SlowTradingSafeHavenLogs,
  SlowTradingWithdrawalLogs,
} from "./SlowTradingLogs";
import {
  SafeHavenQueueCreateDialog,
  WithdrawalQueueCreateDialog,
} from "./SlowTradingQueueDialogs";

const QUEUE_POLL_INTERVAL_MS = 30_000;
const QUEUE_ATTEMPT_INTERVAL_MS = 5 * 60 * 1000;

type SlowTradingQueueRow =
  | SlowTradingSafeHavenQueueItem
  | SlowTradingWithdrawalQueueItem;

function formatTime(timestamp: number) {
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString()
    : "-";
}

function formatDetailedTime(timestamp: number) {
  const date = new Date(timestamp);
  const localTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  const utc = date.toISOString().replace("T", " ").replace("Z", " UTC");

  return `${date.toLocaleString()} ${localTimezone} (${utc})`;
}

function formatUSDT(value: number) {
  return `$${value.toFixed(2)}`;
}

function maskWalletAddress(address: string) {
  const normalized = address.trim();
  if (normalized.length <= 12) {
    return normalized || "missing address";
  }

  return `${normalized.slice(0, 6)}…${normalized.slice(-6)}`;
}

function getQueueAction(row: SlowTradingQueueRow): string {
  if (row.kind === "safe_haven") {
    return `Move ${formatUSDT(row.remainingUSDT)} of ${formatUSDT(row.requestedUSDT)} from spendable balance into Safe Haven for ${row.period}.`;
  }

  return `Withdraw ${formatUSDT(row.amountUSDT)} from schedule "${row.scheduleName}" through ${row.targetNetwork || "an unconfigured network"} to ${maskWalletAddress(row.targetWalletAddress)}.`;
}

function SafeHavenScheduleTooltip(props: {
  dashboardState: SlowTradingDashboardState | null;
  now: number;
  queues: SlowTradingSafeHavenQueueItem[];
}) {
  const { dashboardState, now, queues } = props;
  if (!dashboardState || now <= 0) {
    return <Typography variant="caption">Loading Safe Haven schedule…</Typography>;
  }

  const schedules = dashboardState.runtime.safeHaven.schedules;

  return (
    <Stack spacing={0.75} sx={{ maxWidth: 460 }}>
      <Typography variant="caption">
        Automatic Safe Haven: {dashboardState.runtime.safeHaven.autoEnabled
          ? "enabled"
          : "disabled"}. The runner checks each schedule independently.
      </Typography>
      {schedules.length === 0 && (
        <Typography variant="caption">
          No Safe Haven schedules are configured.
        </Typography>
      )}
      {schedules.map((schedule) => {
        const pending = queues.find((item) => item.scheduleId === schedule.id);
        const nextAt = slowTradingSafeHavenSchedule.timing.getNextOccurrenceAt(
          schedule,
          dashboardState.activeMode,
          now,
        );
        const rule = schedule.amountUSDT > 0
          ? `${schedule.amountUSDT} USDT`
          : `${schedule.pct.toFixed(2)}% of assets`;
        return (
          <Stack key={schedule.id} spacing={0.25}>
            <Typography fontWeight={700} variant="caption">
              {schedule.name}: {rule} on UTC day {schedule.dayOfMonth},{" "}
              {schedule.enabled ? "enabled" : "disabled"}.
            </Typography>
            <Typography variant="caption">
              Next occurrence: {formatDetailedTime(nextAt)}. A due item is
              created on the first runner pass at or after this date.
            </Typography>
            {pending && (
              <Typography variant="caption">
                Pending since {formatDetailedTime(pending.createdAt)}.
              </Typography>
            )}
          </Stack>
        );
      })}
      {!dashboardState.runtime.runnerEnabled && (
        <Typography variant="caption">
          Blocked: the SLOW runner is disabled.
        </Typography>
      )}
      <Typography variant="caption">
        Pending attempts retry every {QUEUE_ATTEMPT_INTERVAL_MS / 60_000} minutes.
      </Typography>
    </Stack>
  );
}

function WithdrawalScheduleTooltip(props: {
  dashboardState: SlowTradingDashboardState | null;
  now: number;
  queues: SlowTradingWithdrawalQueueItem[];
}) {
  const { dashboardState, now, queues } = props;
  if (!dashboardState || now <= 0) {
    return <Typography variant="caption">Loading withdrawal schedules…</Typography>;
  }

  const schedules = dashboardState.runtime.withdrawal.schedules;

  return (
    <Stack spacing={1} sx={{ maxWidth: 520 }}>
      <Typography variant="caption">
        Automatic withdrawal:{" "}
        {dashboardState.runtime.withdrawal.autoEnabled ? "enabled" : "disabled"}.
        The production runner checks pending work every five minutes.
      </Typography>
      {schedules.length === 0 && (
        <Typography variant="caption">
          No withdrawal schedules are configured.
        </Typography>
      )}
      {schedules.map((schedule) => {
        const pending = queues.find(
          (item) => item.scheduleId === schedule.id,
        );
        const nextEligibleAt =
          slowTradingWithdrawalSchedule.timing.getNextOccurrenceAt(
            schedule,
            now,
          );
        const isDue = slowTradingWithdrawalSchedule.timing.isDue(schedule, now);

        return (
          <Stack key={schedule.id} spacing={0.25}>
            <Typography variant="caption" sx={{ fontWeight: "bold" }}>
              {schedule.name}: {schedule.amountUSDT} USDT on UTC day{" "}
              {schedule.dayOfMonth} each month,{" "}
              {schedule.enabled ? "enabled" : "disabled"}.
            </Typography>
            <Typography variant="caption">
              {isDue ? "Due occurrence" : "Next scheduled occurrence"}:{" "}
              {formatDetailedTime(nextEligibleAt)}. Days unavailable in a short
              month use that month&apos;s final day. The item is created on the
              first active runner pass at or after this time.
            </Typography>
            {pending && (
              <Typography variant="caption">
                Current queue created: {formatDetailedTime(pending.createdAt)}.
                This pending item blocks duplicate creation.
              </Typography>
            )}
          </Stack>
        );
      })}
      {dashboardState.activeMode !== "live" && (
        <Typography variant="caption">
          Blocked: SLOW is currently in sandbox mode.
        </Typography>
      )}
      {!dashboardState.runtime.runnerEnabled && (
        <Typography variant="caption">
          Blocked: the production runner is disabled.
        </Typography>
      )}
    </Stack>
  );
}

/** Estimates the Safe Haven amount that the monthly scheduler would request. */
function getSuggestedSafeHavenAmountUSDT(
  dashboardState: SlowTradingDashboardState | null,
): number {
  if (!dashboardState) {
    return 0;
  }

  const modelConfig = dashboardState.config.modelConfig;
  const schedule = dashboardState.runtime.safeHaven.schedules.find(
    (candidate) => candidate.enabled,
  );
  const currentAsset =
    dashboardState.balances.availableQuoteAsset +
    dashboardState.balances.lockedQuoteAsset;
  const fixedUSDT = Math.max(
    0,
    Number(schedule?.amountUSDT ?? modelConfig.safeUSDTPerMonth) || 0,
  );
  const percent = Math.max(
    0,
    schedule
      ? (Number(schedule.pct) || 0) / 100
      : Number(modelConfig.safePercentPerMonth) || 0,
  );
  const desiredUSDT =
    fixedUSDT > 0 ? fixedUSDT : currentAsset * percent;
  const minimumTradingCapitalUSDT = Math.max(
    0,
    Number(modelConfig.minimalAssetOnTrade) || 0,
  );

  return Number(
    Math.min(
      desiredUSDT,
      Math.max(0, currentAsset - minimumTradingCapitalUSDT),
    ).toFixed(8),
  );
}

function QueueTable(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onDelete: (row: SlowTradingQueueRow) => void;
  rows: SlowTradingQueueRow[];
}) {
  const { deletingId, error, loading, onDelete, rows } = props;

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading queue...</Typography>
      </Stack>
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2" sx={{ py: 2 }}>
        {error}
      </Typography>
    );
  }

  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
        No pending queue items.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ mt: 1, maxHeight: 360 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>Created</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Last Attempt</TableCell>
            <TableCell>Next Attempt</TableCell>
            <TableCell>Latest Message</TableCell>
            <TableCell align="right">Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {formatTime(row.createdAt)}
              </TableCell>
              <TableCell sx={{ minWidth: 240 }}>{getQueueAction(row)}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {row.lastAttemptAt ? formatTime(row.lastAttemptAt) : "-"}
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {formatTime(row.nextAttemptAt)}
              </TableCell>
              <TableCell sx={{ minWidth: 220 }}>{row.lastMessage}</TableCell>
              <TableCell align="right">
                <Tooltip title="Delete this pending queue item">
                  <span>
                    <IconButton
                      aria-label="Delete queue item"
                      color="error"
                      disabled={deletingId !== null}
                      onClick={() => onDelete(row)}
                      size="small"
                    >
                      {deletingId === row.id ? (
                        <CircularProgress color="inherit" size={18} />
                      ) : (
                        <DeleteOutlineIcon fontSize="small" />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function QueueSection(props: {
  deletingId: string | null;
  error: string | null;
  loading: boolean;
  onDelete: (row: SlowTradingQueueRow) => void;
  rememberExpand: string;
  rows: SlowTradingQueueRow[];
}) {
  const {
    deletingId,
    error,
    loading,
    onDelete,
    rememberExpand,
    rows,
  } = props;

  return (
    <HeaderMetrics
      defaultExpanded
      rememberExpand={rememberExpand}
      title={
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Queue
        </Typography>
      }
      titleRight={
        <Typography
          color="text.secondary"
          sx={{ whiteSpace: "nowrap" }}
          variant="caption"
        >
          {rows.length} pending
        </Typography>
      }
    >
      {(expanded) => (
        <>
          {expanded && (
            <QueueTable
              deletingId={deletingId}
              error={error}
              loading={loading}
              onDelete={onDelete}
              rows={rows}
            />
          )}
        </>
      )}
    </HeaderMetrics>
  );
}

export default function SlowTradingQueuesPanel(props: {
  dashboardState: SlowTradingDashboardState | null;
}) {
  const { dashboardState } = props;
  const [queues, setQueues] = useState<SlowTradingQueues>({
    safeHaven: [],
    withdrawals: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scheduleNow, setScheduleNow] = useState(0);

  const loadQueues = useCallback(async () => {
    try {
      const response = await axios.get<SlowTradingQueues>(
        endpoints.slow.prod.queue,
      );
      setQueues(response.data);
      setError(null);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
          requestError?.message ??
          "Failed to load queues",
      );
    } finally {
      setScheduleNow(Date.now());
      setLoading(false);
    }
  }, []);

  const createQueue = useCallback(
    async (input: SlowTradingManualQueueCreateInput) => {
      try {
        await axios.post(endpoints.slow.prod.queue, input);
        await loadQueues();
      } catch (requestError: any) {
        throw new Error(
          requestError?.response?.data?.error ??
            requestError?.message ??
            "Failed to create queue item",
        );
      }
    },
    [loadQueues],
  );

  useEffect(() => {
    void loadQueues();
    const intervalId = window.setInterval(() => {
      void loadQueues();
    }, QUEUE_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadQueues]);

  const deleteQueue = useCallback(async (row: SlowTradingQueueRow) => {
    if (
      !confirm(
        "Delete this pending queue item? Its scheduler will wait until the next normal scheduled time.",
      )
    ) {
      return;
    }

    setDeletingId(row.id);
    setError(null);
    try {
      await axios.delete(endpoints.slow.prod.queue, {
        params: {
          id: row.id,
          kind: row.kind,
        },
      });
      setQueues((current) => ({
        safeHaven:
          row.kind === "safe_haven"
            ? current.safeHaven.filter((item) => item.id !== row.id)
            : current.safeHaven,
        withdrawals:
          row.kind === "withdrawal"
            ? current.withdrawals.filter((item) => item.id !== row.id)
            : current.withdrawals,
      }));
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
          requestError?.message ??
          "Failed to delete queue item",
      );
    } finally {
      setDeletingId(null);
    }
  }, []);
  const suggestedSafeHavenAmountUSDT =
    getSuggestedSafeHavenAmountUSDT(dashboardState);
  const activeSafeHavenQueues = queues.safeHaven.filter(
    (item) => item.mode === dashboardState?.activeMode,
  );
  const availableWithdrawalSchedules =
    dashboardState?.runtime.withdrawal.schedules.filter(
      (schedule) =>
        !queues.withdrawals.some(
          (item) => item.scheduleId === schedule.id,
        ),
    ) ?? [];

  return (
    <Stack spacing={2}>
      <Grid container spacing={2} alignItems="flex-start">
        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2}>
            <Stack
              alignItems="center"
              direction="row"
              justifyContent="space-between"
              spacing={1}
            >
              <TypographyTooltip
                tooltipMaxWidth={480}
                tooltipTitle={
                  <SafeHavenScheduleTooltip
                    dashboardState={dashboardState}
                    now={scheduleNow}
                    queues={activeSafeHavenQueues}
                  />
                }
                sx={{ mb: 0 }}
                variant="h6"
              >
                Safe Haven
              </TypographyTooltip>
              <SafeHavenQueueCreateDialog
                activeMode={dashboardState?.activeMode ?? "sandbox"}
                disabled={activeSafeHavenQueues.some(
                  (item) => !item.scheduleId,
                )}
                onCreate={createQueue}
                suggestedAmountUSDT={suggestedSafeHavenAmountUSDT}
              />
            </Stack>
            <QueueSection
              deletingId={deletingId}
              error={error}
              loading={loading}
              onDelete={deleteQueue}
              rememberExpand="slow-trading-queue:safe-haven"
              rows={activeSafeHavenQueues}
            />
            <SlowTradingSafeHavenLogs />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2}>
            <Stack
              alignItems="center"
              direction="row"
              justifyContent="space-between"
              spacing={1}
            >
              <TypographyTooltip
                tooltipMaxWidth={560}
                tooltipTitle={
                  <WithdrawalScheduleTooltip
                    dashboardState={dashboardState}
                    now={scheduleNow}
                    queues={queues.withdrawals}
                  />
                }
                sx={{ mb: 0 }}
                variant="h6"
              >
                Withdraw
              </TypographyTooltip>
              <WithdrawalQueueCreateDialog
                activeMode={dashboardState?.activeMode ?? "sandbox"}
                autoEnabled={
                  dashboardState?.runtime.withdrawal.autoEnabled ?? false
                }
                disabled={!dashboardState}
                exchangeType={dashboardState?.config.exchangeType ?? ""}
                onCreate={createQueue}
                schedules={availableWithdrawalSchedules}
              />
            </Stack>
            <QueueSection
              deletingId={deletingId}
              error={error}
              loading={loading}
              onDelete={deleteQueue}
              rememberExpand="slow-trading-queue:withdrawal"
              rows={queues.withdrawals}
            />
            <SlowTradingWithdrawalLogs />
          </Stack>
        </Grid>
      </Grid>

      <SlowTradingErrorLogs />
      <SlowTradingManagementLogs />
    </Stack>
  );
}
