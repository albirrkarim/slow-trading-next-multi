"use client";

import {
  Alert,
  Box,
  Grid,
  Stack,
  Switch,
  Typography,
} from "@mui/material";

import SettingsDialogSection from "./SettingsDialogSection";
import SettingsInfoField from "./SettingsInfoField";
import type {
  ConfigDraft,
  ConfigDraftSetter,
  WithdrawalScheduleDraft,
  WithdrawalWalletDraft,
} from "./types";
import { WithdrawalScheduleCreateDialog } from "./WithdrawalScheduleDialogs";
import WithdrawalScheduleTable from "./WithdrawalScheduleTable";
import { WithdrawalWalletCreateDialog } from "./WithdrawalWalletDialogs";
import WithdrawalWalletTable from "./WithdrawalWalletTable";

interface SettingsDialogWithdrawTabProps {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
  tryWithdrawNow: (scheduleId: string) => Promise<void>;
  tryingWithdraw: boolean;
}

export default function SettingsDialogWithdrawTab({
  configDraft,
  setConfigDraft,
  tryWithdrawNow,
  tryingWithdraw,
}: SettingsDialogWithdrawTabProps) {
  const addWallet = (wallet: WithdrawalWalletDraft) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            withdrawalWalletBook: [...prev.withdrawalWalletBook, wallet],
          }
        : prev,
    );
  };

  const updateWallet = (updatedWallet: WithdrawalWalletDraft) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            withdrawalWalletBook: prev.withdrawalWalletBook.map((wallet) =>
              wallet.id === updatedWallet.id ? updatedWallet : wallet,
            ),
          }
        : prev,
    );
  };

  const deleteWallet = (walletId: string) => {
    setConfigDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const wallet = prev.withdrawalWalletBook.find(
        (candidate) => candidate.id === walletId,
      );

      return {
        ...prev,
        withdrawalWalletBook: prev.withdrawalWalletBook.filter(
          (candidate) => candidate.id !== walletId,
        ),
        withdrawalSchedules: prev.withdrawalSchedules.map((schedule) =>
          schedule.walletId === walletId
            ? {
                ...schedule,
                walletId: "",
                targetNetwork: wallet?.network ?? schedule.targetNetwork,
                targetWalletAddress:
                  wallet?.address ?? schedule.targetWalletAddress,
              }
            : schedule,
        ),
      };
    });
  };

  const addSchedule = (schedule: WithdrawalScheduleDraft) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            withdrawalSchedules: [...prev.withdrawalSchedules, schedule],
          }
        : prev,
    );
  };

  const updateSchedule = (updatedSchedule: WithdrawalScheduleDraft) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            withdrawalSchedules: prev.withdrawalSchedules.map((schedule) =>
              schedule.id === updatedSchedule.id
                ? updatedSchedule
                : schedule,
            ),
          }
        : prev,
    );
  };

  const deleteSchedule = (scheduleId: string) => {
    setConfigDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const nextSchedules = prev.withdrawalSchedules.filter(
        (schedule) => schedule.id !== scheduleId,
      );

      return {
        ...prev,
        withdrawalSchedules: nextSchedules,
      };
    });
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <SettingsDialogSection
          title="Manual Withdrawal"
          description="Edit the current Safe Haven balance after you manually withdraw or deposit reserve USDT outside the bot."
        >
          <Stack spacing={2}>
            <SettingsInfoField
              label="Safe Haven Balance (USDT)"
              type="number"
              size="small"
              fullWidth
              value={configDraft.safeHavenUSDT}
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev ? { ...prev, safeHavenUSDT: event.target.value } : prev,
                )
              }
              info="This updates the active mode Safe Haven value used by SLOW balance math. It does not send funds on-chain."
            />

            <Alert severity="info">
              Safe Haven is an internal reserve number. If you move funds
              manually on the exchange, update this value so SLOW keeps the
              available balance correct.
            </Alert>
          </Stack>
        </SettingsDialogSection>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <SettingsDialogSection
          title="Wallet Book"
          description="Remember target wallets so schedules can reuse the same network and address."
        >
          <Stack spacing={2}>
            <Stack
              alignItems={{ xs: "stretch", sm: "center" }}
              direction={{ xs: "column", sm: "row" }}
              justifyContent="flex-end"
            >
              <WithdrawalWalletCreateDialog
                onCreate={addWallet}
                walletCount={configDraft.withdrawalWalletBook.length}
              />
            </Stack>

            <WithdrawalWalletTable
              onDelete={deleteWallet}
              onUpdate={updateWallet}
              schedules={configDraft.withdrawalSchedules}
              wallets={configDraft.withdrawalWalletBook}
            />
          </Stack>
        </SettingsDialogSection>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <SettingsDialogSection
          title="Recurring Withdrawal Schedules"
          description="Create one schedule per recurring payment. Use the row actions to update, delete, or submit a capped real-withdrawal test."
        >
          <Stack spacing={2}>
            <Stack
              alignItems={{ xs: "stretch", sm: "center" }}
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Switch
                    checked={configDraft.withdrawalAutoEnabled}
                    onChange={(event) =>
                      setConfigDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              withdrawalAutoEnabled: event.target.checked,
                            }
                          : prev,
                      )
                    }
                    color="default"
                    size="small"
                  />
                  <Typography variant="body2" fontWeight="bold">
                    Auto Withdrawal:{" "}
                    {configDraft.withdrawalAutoEnabled ? "ON" : "OFF"}
                  </Typography>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", ml: { xs: 0, sm: 6 }, mt: -0.5 }}
                >
                  The production SLOW runner creates due queue items
                  automatically. Schedule changes are persisted with the main
                  Save button.
                </Typography>
              </Box>

              <WithdrawalScheduleCreateDialog
                accounts={configDraft.exchangeAccounts}
                onCreate={addSchedule}
                scheduleCount={configDraft.withdrawalSchedules.length}
                walletBook={configDraft.withdrawalWalletBook}
              />
            </Stack>

            <WithdrawalScheduleTable
              accounts={configDraft.exchangeAccounts}
              onDelete={deleteSchedule}
              onTest={tryWithdrawNow}
              onUpdate={updateSchedule}
              schedules={configDraft.withdrawalSchedules}
              testing={tryingWithdraw}
              walletBook={configDraft.withdrawalWalletBook}
            />
          </Stack>
        </SettingsDialogSection>
      </Grid>
    </Grid>
  );
}
