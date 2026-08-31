"use client";

import {
  Alert,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import type { SlowTradingWithdrawalSchedule } from "@/lib/slowTrading";
import slowTradingWithdrawalSchedule from "@/lib/slowTrading/withdrawal-schedule";

import {
  WithdrawalScheduleDeleteDialog,
  WithdrawalScheduleTestDialog,
  WithdrawalScheduleUpdateDialog,
} from "./WithdrawalScheduleDialogs";
import type {
  WithdrawalScheduleDraft,
  WithdrawalWalletDraft,
} from "./types";

function normalizeSchedule(
  schedule: WithdrawalScheduleDraft,
): SlowTradingWithdrawalSchedule {
  return {
    ...schedule,
    amountUSDT: Math.max(0, Number(schedule.amountUSDT) || 0),
    dayOfMonth: slowTradingWithdrawalSchedule.values.normalizeDayOfMonth(
      schedule.dayOfMonth,
    ),
    ...(schedule.walletId ? { walletId: schedule.walletId } : {}),
  };
}

function formatAmount(value: string): string {
  return `${Math.max(0, Number(value) || 0).toFixed(2)} USDT`;
}

function formatNextOccurrence(schedule: WithdrawalScheduleDraft): {
  detail: string;
  label: string;
} {
  const normalized = normalizeSchedule(schedule);
  const now = Date.now();
  const occurrenceAt =
    slowTradingWithdrawalSchedule.timing.getNextOccurrenceAt(normalized, now);
  const date = new Date(occurrenceAt);
  const due = slowTradingWithdrawalSchedule.timing.isDue(
    { ...normalized, enabled: true },
    now,
  );

  return {
    label: due
      ? normalized.enabled
        ? "Due now"
        : "Due when enabled"
      : date.toLocaleString(),
    detail: `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`,
  };
}

function maskWalletAddress(address: string): string {
  const normalized = address.trim();
  if (!normalized) {
    return "Missing address";
  }
  if (normalized.length <= 14) {
    return normalized;
  }
  return `${normalized.slice(0, 7)}…${normalized.slice(-6)}`;
}

function getWalletDisplay(
  schedule: WithdrawalScheduleDraft,
  walletBook: WithdrawalWalletDraft[],
): {
  detail: string;
  name: string;
} {
  const wallet = schedule.walletId
    ? walletBook.find((candidate) => candidate.id === schedule.walletId)
    : undefined;
  const network = wallet?.network ?? schedule.targetNetwork;
  const address = wallet?.address ?? schedule.targetWalletAddress;

  return {
    name: wallet?.name ?? (schedule.walletId ? "Missing wallet" : "Custom"),
    detail: `${network || "No network"} · ${maskWalletAddress(address)}`,
  };
}

export default function WithdrawalScheduleTable(props: {
  accounts: Array<{ name: string; slug: string }>;
  onDelete: (scheduleId: string) => void;
  onTest: (scheduleId: string) => Promise<void>;
  onUpdate: (schedule: WithdrawalScheduleDraft) => void;
  schedules: WithdrawalScheduleDraft[];
  testing: boolean;
  walletBook: WithdrawalWalletDraft[];
}) {
  const { accounts, onDelete, onTest, onUpdate, schedules, testing, walletBook } = props;

  if (schedules.length === 0) {
    return (
      <Alert severity="info">
        No withdrawal schedules yet. Add one schedule for each recurring
        payment.
      </Alert>
    );
  }

  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 980 }}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Account</TableCell>
            <TableCell>Amount</TableCell>
            <TableCell>Monthly Date</TableCell>
            <TableCell>Next Occurrence</TableCell>
            <TableCell>Wallet</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {schedules.map((schedule) => {
            const nextOccurrence = formatNextOccurrence(schedule);
            const wallet = getWalletDisplay(schedule, walletBook);
            const walletEntry = schedule.walletId
              ? walletBook.find(
                  (candidate) => candidate.id === schedule.walletId,
                )
              : undefined;

            return (
              <TableRow key={schedule.id} hover>
                <TableCell>
                  <Stack spacing={0.5} alignItems="flex-start">
                    <Typography variant="body2" fontWeight={700}>
                      {schedule.name}
                    </Typography>
                    <Chip
                      color={schedule.enabled ? "success" : "default"}
                      label={schedule.enabled ? "ON" : "OFF"}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {accounts.find((account) => account.slug === schedule.account)
                    ?.name ?? schedule.account}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {formatAmount(schedule.amountUSDT)}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  Day {schedule.dayOfMonth} UTC
                  {Number(schedule.dayOfMonth) >= 29 && (
                    <Typography
                      color="text.secondary"
                      display="block"
                      variant="caption"
                    >
                      Last day when shorter
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Typography variant="body2">
                    {nextOccurrence.label}
                  </Typography>
                  <Typography color="text.secondary" variant="caption">
                    {nextOccurrence.detail}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>
                    {wallet.name}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    sx={{ whiteSpace: "nowrap" }}
                    variant="caption"
                  >
                    {wallet.detail}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    justifyContent="flex-end"
                    spacing={0.25}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    <WithdrawalScheduleUpdateDialog
                      accounts={accounts}
                      onUpdate={onUpdate}
                      schedule={schedule}
                      walletBook={walletBook}
                    />
                    <WithdrawalScheduleDeleteDialog
                      onDelete={onDelete}
                      schedule={schedule}
                    />
                    <WithdrawalScheduleTestDialog
                      onTest={onTest}
                      schedule={schedule}
                      testing={testing}
                      wallet={walletEntry}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
