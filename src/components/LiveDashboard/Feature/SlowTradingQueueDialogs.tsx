"use client";

import AddTaskIcon from "@mui/icons-material/AddTask";
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";
import type {
  SlowTradingManualQueueCreateInput,
  SlowTradingWithdrawalSchedule,
} from "@/lib/slowTrading";

interface QueueCreateDialogProps {
  disabled?: boolean;
  onCreate: (input: SlowTradingManualQueueCreateInput) => Promise<void>;
}

export function SafeHavenQueueCreateDialog(
  props: QueueCreateDialogProps & {
    activeMode: "live" | "sandbox";
    suggestedAmountUSDT: number;
  },
) {
  const { activeMode, disabled, onCreate, suggestedAmountUSDT } = props;
  const [amountUSDT, setAmountUSDT] = useState(
    String(suggestedAmountUSDT || 0),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmountUSDT(String(suggestedAmountUSDT || 0));
  }, [suggestedAmountUSDT]);

  return (
    <ButtonDialog
      disabled={disabled}
      size="small"
      startIcon={<AddTaskIcon />}
      title="Create Queue"
      titleLong="Create Safe Haven Queue"
      variant="outlined"
    >
      {(handleClose) => (
        <Stack spacing={2}>
          <Alert severity="info">
            This creates the current {activeMode} Safe Haven queue occurrence
            manually. Safe Haven is virtual in both modes. The runner may move
            it partially and removes it after the full amount is collected.
          </Alert>
          <TextField
            fullWidth
            label="Requested amount (USDT)"
            onChange={(event) => setAmountUSDT(event.target.value)}
            slotProps={{
              htmlInput: {
                min: 0.01,
                step: 0.01,
              },
            }}
            type="number"
            value={amountUSDT}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button disabled={creating} onClick={handleClose}>
              Cancel
            </Button>
            <Button
              disabled={creating || !(Number(amountUSDT) > 0)}
              onClick={async () => {
                setCreating(true);
                setError(null);
                try {
                  await onCreate({
                    kind: "safe_haven",
                    amountUSDT: Number(amountUSDT),
                  });
                  handleClose();
                } catch (createError) {
                  setError(
                    createError instanceof Error
                      ? createError.message
                      : "Failed to create Safe Haven queue.",
                  );
                } finally {
                  setCreating(false);
                }
              }}
              startIcon={creating && <CircularProgress size={16} />}
              variant="contained"
            >
              {creating ? "Creating..." : "Create Queue"}
            </Button>
          </Stack>
        </Stack>
      )}
    </ButtonDialog>
  );
}

export function WithdrawalQueueCreateDialog(
  props: QueueCreateDialogProps & {
    activeMode: "live" | "sandbox";
    autoEnabled: boolean;
    exchangeType: string;
    schedules: SlowTradingWithdrawalSchedule[];
  },
) {
  const {
    activeMode,
    autoEnabled,
    disabled,
    exchangeType,
    onCreate,
    schedules,
  } = props;
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSchedule = schedules.find(
    (schedule) => schedule.id === scheduleId,
  );

  useEffect(() => {
    if (!schedules.some((schedule) => schedule.id === scheduleId)) {
      setScheduleId(schedules[0]?.id ?? "");
    }
  }, [scheduleId, schedules]);

  const canExecuteAutomatically =
    activeMode === "live" &&
    autoEnabled &&
    exchangeType === "binance" &&
    selectedSchedule?.enabled;

  return (
    <ButtonDialog
      disabled={disabled || schedules.length === 0}
      size="small"
      startIcon={<AddTaskIcon />}
      title="Create Queue"
      titleLong="Create Withdrawal Queue"
      variant="outlined"
    >
      {(handleClose) => (
        <Stack spacing={2}>
          <Alert severity={canExecuteAutomatically ? "warning" : "info"}>
            This creates a production automatic withdrawal queue. When its
            safety checks pass, it submits the schedule&apos;s full amount—not
            the 2 USDT manual-withdrawal amount.
          </Alert>
          <TextField
            fullWidth
            label="Withdrawal schedule"
            onChange={(event) => setScheduleId(event.target.value)}
            select
            value={scheduleId}
          >
            {schedules.map((schedule) => (
              <MenuItem key={schedule.id} value={schedule.id}>
                {schedule.name} — {schedule.amountUSDT} USDT
                {!schedule.enabled && " (disabled)"}
              </MenuItem>
            ))}
          </TextField>
          {selectedSchedule && (
            <Typography color="text.secondary" variant="body2">
              Network: {selectedSchedule.targetNetwork || "not configured"}.
              Automatic withdrawal: {autoEnabled ? "enabled" : "disabled"}.
              Active mode: {activeMode}.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button disabled={creating} onClick={handleClose}>
              Cancel
            </Button>
            <Button
              color="warning"
              disabled={creating || !scheduleId}
              onClick={async () => {
                setCreating(true);
                setError(null);
                try {
                  await onCreate({
                    kind: "withdrawal",
                    scheduleId,
                  });
                  handleClose();
                } catch (createError) {
                  setError(
                    createError instanceof Error
                      ? createError.message
                      : "Failed to create withdrawal queue.",
                  );
                } finally {
                  setCreating(false);
                }
              }}
              startIcon={creating && <CircularProgress size={16} />}
              variant="contained"
            >
              {creating ? "Creating..." : "Create Queue"}
            </Button>
          </Stack>
        </Stack>
      )}
    </ButtonDialog>
  );
}
