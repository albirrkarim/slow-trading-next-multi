"use client";

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useState } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";
import slowTradingSafeHavenSchedule from "@/lib/slowTrading/safe-haven-schedule";

import SettingsInfoField from "./SettingsInfoField";
import type {
  ConfigDraftSetter,
  SafeHavenScheduleDraft,
} from "./types";

function createDefaultSchedule(index: number): SafeHavenScheduleDraft {
  return {
    id: "",
    name: `Safe Haven ${index + 1}`,
    enabled: true,
    amountUSDT: "10",
    pct: "0",
    dayOfMonth: "1",
  };
}

function createScheduleId(): string {
  return `safe-haven-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ScheduleForm(props: {
  initialSchedule: SafeHavenScheduleDraft;
  onClose: () => void;
  onSubmit: (schedule: SafeHavenScheduleDraft) => void;
}) {
  const { initialSchedule, onClose, onSubmit } = props;
  const [schedule, setSchedule] = useState({ ...initialSchedule });
  const patchSchedule = (patch: Partial<SafeHavenScheduleDraft>) =>
    setSchedule((current) => ({ ...current, ...patch }));
  const amountUSDT = Math.max(0, Number(schedule.amountUSDT) || 0);
  const pct = Math.max(0, Number(schedule.pct) || 0);
  const dayOfMonth = Number(schedule.dayOfMonth);
  const canSubmit =
    schedule.name.trim().length > 0 &&
    (amountUSDT > 0 || (pct > 0 && pct <= 100)) &&
    Number.isInteger(dayOfMonth) &&
    dayOfMonth >= 1 &&
    dayOfMonth <= 31;

  return (
    <Stack spacing={2}>
      <Stack alignItems="center" direction="row" spacing={1}>
        <Switch
          checked={schedule.enabled}
          onChange={(event) => patchSchedule({ enabled: event.target.checked })}
          size="small"
        />
        <Typography fontWeight={700} variant="body2">
          Schedule: {schedule.enabled ? "ON" : "OFF"}
        </Typography>
      </Stack>
      <SettingsInfoField
        fullWidth
        info="A short label used in the Safe Haven queue, for example Mid-month profit reserve."
        label="Schedule Name"
        onChange={(event) => patchSchedule({ name: event.target.value })}
        size="small"
        value={schedule.name}
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SettingsInfoField
            fullWidth
            info="Fixed amount to protect. A value above 0 takes priority over the percentage."
            label="Amount (USDT)"
            onChange={(event) =>
              patchSchedule({ amountUSDT: event.target.value })
            }
            size="small"
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            type="number"
            value={schedule.amountUSDT}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SettingsInfoField
            fullWidth
            info="Percentage of current portfolio assets to protect, using 10 for 10%. Used only when Amount is 0."
            label="Portfolio Percent (%)"
            onChange={(event) => patchSchedule({ pct: event.target.value })}
            size="small"
            slotProps={{ htmlInput: { min: 0, max: 100, step: 0.1 } }}
            type="number"
            value={schedule.pct}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SettingsInfoField
            fullWidth
            info="Runs monthly on this UTC date. Dates 29–31 use the month's final day when shorter."
            label="Day of Month (UTC)"
            onChange={(event) =>
              patchSchedule({ dayOfMonth: event.target.value })
            }
            size="small"
            slotProps={{ htmlInput: { min: 1, max: 31, step: 1 } }}
            type="number"
            value={schedule.dayOfMonth}
          />
        </Grid>
      </Grid>
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
          Save Schedule
        </Button>
      </Stack>
    </Stack>
  );
}

function formatRule(schedule: SafeHavenScheduleDraft): string {
  const amount = Math.max(0, Number(schedule.amountUSDT) || 0);
  if (amount > 0) {
    return `${amount.toFixed(2)} USDT`;
  }
  return `${Math.max(0, Number(schedule.pct) || 0).toFixed(2)}% of assets`;
}

function formatNextOccurrence(schedule: SafeHavenScheduleDraft): string {
  const occurrenceAt = slowTradingSafeHavenSchedule.timing.getNextOccurrenceAt(
    {
      ...schedule,
      amountUSDT: Number(schedule.amountUSDT) || 0,
      pct: Number(schedule.pct) || 0,
      dayOfMonth: Number(schedule.dayOfMonth) || 1,
    },
    "live",
    Date.now(),
  );
  return `${new Date(occurrenceAt).toISOString().slice(0, 10)} UTC`;
}

export default function SafeHavenScheduleSettings(props: {
  autoEnabled: boolean;
  schedules: SafeHavenScheduleDraft[];
  setConfigDraft: ConfigDraftSetter;
}) {
  const { autoEnabled, schedules, setConfigDraft } = props;
  const saveSchedule = (schedule: SafeHavenScheduleDraft) =>
    setConfigDraft((current) =>
      current
        ? {
            ...current,
            safeHavenSchedules: (current.safeHavenSchedules ?? []).some(
              (candidate) => candidate.id === schedule.id,
            )
              ? (current.safeHavenSchedules ?? []).map((candidate) =>
                  candidate.id === schedule.id ? schedule : candidate,
                )
              : [...(current.safeHavenSchedules ?? []), schedule],
          }
        : current,
    );
  const deleteSchedule = (id: string) =>
    setConfigDraft((current) =>
      current
        ? {
            ...current,
            safeHavenSchedules: (current.safeHavenSchedules ?? []).filter(
              (candidate) => candidate.id !== id,
            ),
          }
        : current,
    );

  return (
    <Stack spacing={1.5}>
      <Stack
        alignItems={{ xs: "flex-start", sm: "center" }}
        direction={{ xs: "column", sm: "row" }}
        gap={1}
      >
        <Stack alignItems="center" direction="row" sx={{ flex: 1 }}>
          <Switch
            checked={autoEnabled}
            onChange={(event) =>
              setConfigDraft((current) =>
                current
                  ? {
                      ...current,
                      safeHavenAutoEnabled: event.target.checked,
                    }
                  : current,
              )
            }
            size="small"
          />
          <Box>
            <Typography fontWeight={700} variant="body2">
              Automatic Safe Haven: {autoEnabled ? "ON" : "OFF"}
            </Typography>
            <Typography color="text.secondary" variant="caption">
              Due items are created on the first runner pass at or after their
              UTC date.
            </Typography>
          </Box>
        </Stack>
        <ButtonDialog
          startIcon={<AddCircleOutlineIcon />}
          title="Add Schedule"
          titleLong="Add Safe Haven Schedule"
          variant="outlined"
        >
          {(handleClose) => (
            <ScheduleForm
              initialSchedule={createDefaultSchedule(schedules.length)}
              onClose={handleClose}
              onSubmit={saveSchedule}
            />
          )}
        </ButtonDialog>
      </Stack>

      {schedules.length === 0 && (
        <Alert severity="info">
          No Safe Haven schedules yet. Add one or more monthly reserve dates.
        </Alert>
      )}
      <Grid container spacing={1}>
        {schedules.map((schedule) => (
          <Grid key={schedule.id} size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                height: "100%",
                p: 1.25,
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                gap={1}
                justifyContent="space-between"
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack alignItems="center" direction="row" gap={0.75}>
                    <Typography fontWeight={700} noWrap variant="body2">
                      {schedule.name}
                    </Typography>
                    <Chip
                      color={schedule.enabled ? "success" : "default"}
                      label={schedule.enabled ? "ON" : "OFF"}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                  <Typography variant="body2">
                    {formatRule(schedule)} · Day {schedule.dayOfMonth} UTC
                  </Typography>
                  <Typography color="text.secondary" variant="caption">
                    Next: {formatNextOccurrence(schedule)}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                >
                  <ButtonDialog
                    customButton={(handleOpen) => (
                      <Button
                        onClick={handleOpen}
                        size="small"
                        startIcon={<EditOutlinedIcon />}
                      >
                        Update
                      </Button>
                    )}
                    title="Update"
                    titleLong={`Update ${schedule.name}`}
                  >
                    {(handleClose) => (
                      <ScheduleForm
                        initialSchedule={schedule}
                        onClose={handleClose}
                        onSubmit={saveSchedule}
                      />
                    )}
                  </ButtonDialog>
                  <Button
                    color="error"
                    onClick={() => deleteSchedule(schedule.id)}
                    size="small"
                    startIcon={<DeleteOutlineIcon />}
                  >
                    Delete
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
