"use client";

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import {
  Alert,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useState } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";

import SettingsInfoField from "./SettingsInfoField";
import type {
  WithdrawalScheduleDraft,
  WithdrawalWalletDraft,
} from "./types";
import WithdrawalNetworkAutocomplete from "./WithdrawalNetworkAutocomplete";

function createScheduleId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultSchedule(
  index: number,
  account: string,
): WithdrawalScheduleDraft {
  return {
    id: "",
    account,
    name: `Schedule ${index + 1}`,
    enabled: true,
    amountUSDT: "3",
    dayOfMonth: "1",
    walletId: "",
    targetNetwork: "TRX",
    targetWalletAddress: "",
  };
}

function WithdrawalScheduleForm(props: {
  accounts: Array<{ name: string; slug: string }>;
  initialSchedule: WithdrawalScheduleDraft;
  onClose: () => void;
  onSubmit: (schedule: WithdrawalScheduleDraft) => void;
  submitLabel: string;
  walletBook: WithdrawalWalletDraft[];
}) {
  const { accounts, initialSchedule, onClose, onSubmit, submitLabel, walletBook } = props;
  const [schedule, setSchedule] = useState<WithdrawalScheduleDraft>({
    ...initialSchedule,
  });

  const patchSchedule = (patch: Partial<WithdrawalScheduleDraft>) => {
    setSchedule((current) => ({ ...current, ...patch }));
  };

  const selectWallet = (walletId: string) => {
    const wallet = walletBook.find((candidate) => candidate.id === walletId);
    patchSchedule({
      walletId,
      ...(wallet
        ? {
            targetNetwork: wallet.network,
            targetWalletAddress: wallet.address,
          }
        : {}),
    });
  };

  const amountUSDT = Number(schedule.amountUSDT);
  const dayOfMonth = Number(schedule.dayOfMonth);
  const canSubmit =
    schedule.account.length > 0 &&
    schedule.name.trim().length > 0 &&
    amountUSDT > 0 &&
    Number.isInteger(dayOfMonth) &&
    dayOfMonth >= 1 &&
    dayOfMonth <= 31;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Switch
          checked={schedule.enabled}
          onChange={(event) =>
            patchSchedule({ enabled: event.target.checked })
          }
          color="default"
          size="small"
        />
        <Typography variant="body2" fontWeight="bold">
          Schedule: {schedule.enabled ? "ON" : "OFF"}
        </Typography>
      </Stack>

      <SettingsInfoField
        label="Schedule Name"
        size="small"
        fullWidth
        value={schedule.name}
        onChange={(event) => patchSchedule({ name: event.target.value })}
        info="Friendly name, for example Railway Hosting Monthly."
      />

      <SettingsInfoField
        label="Account"
        select
        size="small"
        fullWidth
        value={schedule.account}
        onChange={(event) => patchSchedule({ account: event.target.value })}
        info="The immutable account whose Safe Haven funds this schedule withdraws."
      >
        {accounts.map((account) => (
          <MenuItem key={account.slug} value={account.slug}>
            {account.name} ({account.slug})
          </MenuItem>
        ))}
      </SettingsInfoField>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <SettingsInfoField
            label="Amount (USDT)"
            type="number"
            size="small"
            fullWidth
            value={schedule.amountUSDT}
            onChange={(event) =>
              patchSchedule({ amountUSDT: event.target.value })
            }
            slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
            info="Automatic withdrawals use this amount. Test is capped at 2 USDT by the server."
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <SettingsInfoField
            label="Day of month (UTC)"
            type="number"
            size="small"
            fullWidth
            value={schedule.dayOfMonth}
            onChange={(event) =>
              patchSchedule({ dayOfMonth: event.target.value })
            }
            slotProps={{
              htmlInput: {
                min: 1,
                max: 31,
                step: 1,
              },
            }}
            info="Runs monthly on this UTC calendar day. Values 29–31 use the month's final day when shorter."
          />
        </Grid>
      </Grid>

      <SettingsInfoField
        label="Wallet Book Entry"
        select
        size="small"
        fullWidth
        value={schedule.walletId}
        onChange={(event) => selectWallet(event.target.value)}
        info="Choose a saved wallet or keep a custom network and address."
      >
        <MenuItem value="">Custom / Manual Address</MenuItem>
        {walletBook.map((wallet) => (
          <MenuItem key={wallet.id} value={wallet.id}>
            {wallet.name} - {wallet.network}
          </MenuItem>
        ))}
      </SettingsInfoField>

      <WithdrawalNetworkAutocomplete
        label="Target Network"
        value={schedule.targetNetwork}
        onChange={(value) => patchSchedule({ targetNetwork: value })}
        helperText="Saved as a Binance network code such as BSC, TRX, ETH, or MATIC."
      />

      <SettingsInfoField
        label="Target Wallet Address"
        size="small"
        fullWidth
        value={schedule.targetWalletAddress}
        onChange={(event) =>
          patchSchedule({ targetWalletAddress: event.target.value })
        }
        info="External wallet address for this schedule."
      />

      {schedule.lastStatus && (
        <Typography variant="caption" color="text.secondary">
          Last status: {schedule.lastStatus}
        </Typography>
      )}

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={!canSubmit}
          onClick={() => {
            onSubmit({
              ...schedule,
              id: schedule.id || createScheduleId(),
            });
            onClose();
          }}
          variant="contained"
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

export function WithdrawalScheduleCreateDialog(props: {
  accounts: Array<{ name: string; slug: string }>;
  scheduleCount: number;
  walletBook: WithdrawalWalletDraft[];
  onCreate: (schedule: WithdrawalScheduleDraft) => void;
}) {
  const { accounts, onCreate, scheduleCount, walletBook } = props;

  return (
    <ButtonDialog
      title="Add Schedule"
      titleLong="Add Recurring Withdrawal Schedule"
      variant="outlined"
      startIcon={<AddCircleOutlineIcon />}
    >
      {(handleClose) => (
        <WithdrawalScheduleForm
          accounts={accounts}
          initialSchedule={createDefaultSchedule(
            scheduleCount,
            accounts[0]?.slug ?? "",
          )}
          onClose={handleClose}
          onSubmit={onCreate}
          submitLabel="Add Schedule"
          walletBook={walletBook}
        />
      )}
    </ButtonDialog>
  );
}

export function WithdrawalScheduleUpdateDialog(props: {
  accounts: Array<{ name: string; slug: string }>;
  schedule: WithdrawalScheduleDraft;
  walletBook: WithdrawalWalletDraft[];
  onUpdate: (schedule: WithdrawalScheduleDraft) => void;
}) {
  const { accounts, onUpdate, schedule, walletBook } = props;

  return (
    <ButtonDialog
      title="Update"
      titleLong={`Update ${schedule.name}`}
      customButton={(handleOpen) => (
        <Button
          onClick={handleOpen}
          size="small"
          startIcon={<EditOutlinedIcon />}
        >
          Update
        </Button>
      )}
    >
      {(handleClose) => (
        <WithdrawalScheduleForm
          accounts={accounts}
          initialSchedule={schedule}
          onClose={handleClose}
          onSubmit={onUpdate}
          submitLabel="Update Schedule"
          walletBook={walletBook}
        />
      )}
    </ButtonDialog>
  );
}

export function WithdrawalScheduleDeleteDialog(props: {
  schedule: WithdrawalScheduleDraft;
  onDelete: (scheduleId: string) => void;
}) {
  const { onDelete, schedule } = props;

  return (
    <ButtonDialog
      title="Delete"
      titleLong={`Delete ${schedule.name}`}
      customButton={(handleOpen) => (
        <Button
          color="error"
          onClick={handleOpen}
          size="small"
          startIcon={<DeleteOutlineIcon />}
        >
          Delete
        </Button>
      )}
    >
      {(handleClose) => (
        <Stack spacing={2}>
          <Alert severity="warning">
            Delete withdrawal schedule &quot;{schedule.name}&quot;? The change
            is persisted when you save the dashboard settings.
          </Alert>
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              color="error"
              onClick={() => {
                onDelete(schedule.id);
                handleClose();
              }}
              variant="contained"
            >
              Delete Schedule
            </Button>
          </Stack>
        </Stack>
      )}
    </ButtonDialog>
  );
}

export function WithdrawalScheduleTestDialog(props: {
  schedule: WithdrawalScheduleDraft;
  testing: boolean;
  wallet?: WithdrawalWalletDraft;
  onTest: (scheduleId: string) => Promise<void>;
}) {
  const { onTest, schedule, testing, wallet } = props;
  const cappedAmountUSDT = Math.min(
    Math.max(0, Number(schedule.amountUSDT) || 0),
    2,
  );
  const targetNetwork = wallet?.network ?? schedule.targetNetwork;
  const targetWalletAddress = wallet?.address ?? schedule.targetWalletAddress;

  return (
    <ButtonDialog
      disabled={testing}
      title="Test"
      titleLong={`Test ${schedule.name}`}
      customButton={(handleOpen) => (
        <Button
          color="warning"
          disabled={testing}
          onClick={handleOpen}
          size="small"
          startIcon={
            testing ? (
              <CircularProgress size={14} />
            ) : (
              <ScienceOutlinedIcon />
            )
          }
        >
          Test
        </Button>
      )}
    >
      {(handleClose) => (
        <Stack spacing={2}>
          <Alert severity="warning">
            This is a real Binance withdrawal test, not a dry run. It submits up
            to {cappedAmountUSDT} USDT and the server always caps the test at 2
            USDT. Safe Haven is reduced only after Binance accepts it.
          </Alert>
          <Typography variant="body2">
            Target: {targetNetwork || "missing network"} ·{" "}
            {targetWalletAddress || "missing wallet address"}
          </Typography>
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button disabled={testing} onClick={handleClose}>
              Cancel
            </Button>
            <Button
              color="warning"
              disabled={testing}
              onClick={async () => {
                await onTest(schedule.id);
                handleClose();
              }}
              startIcon={testing && <CircularProgress size={16} />}
              variant="contained"
            >
              {testing ? "Testing..." : `Withdraw up to ${cappedAmountUSDT} USDT`}
            </Button>
          </Stack>
        </Stack>
      )}
    </ButtonDialog>
  );
}
