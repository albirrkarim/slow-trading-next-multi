"use client";

import { useState } from "react";

import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Stack,
  Switch,
  Typography,
} from "@mui/material";

import SettingsInfoField from "./SettingsInfoField";
import SettingsDialogSection from "./SettingsDialogSection";
import RuntimeMonitoringSettings from "./RuntimeMonitoringSettings";
import type { ConfigDraft, ConfigDraftSetter } from "./types";
import { updateAccountSettingsInConfigDraft } from "./helpers";

const DEFAULT_SYNC_ONLINE_BASE_URL = "https://wealth.reinventwp.com";

interface SettingsDialogRuntimeTabProps {
  configDraft: ConfigDraft;
  onReinitialize: () => Promise<void>;
  reinitializing: boolean;
  resetSandbox: (accountSlug: string) => Promise<void>;
  resettingSandboxAccount: string | null;
  setConfigDraft: ConfigDraftSetter;
  syncOnlineStorageToLocal: (onlineBaseUrl: string) => Promise<void>;
  syncingOnlineStorage: boolean;
}

function RuntimeToggle(props: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const { checked, description, label, onChange } = props;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <Switch
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          color="default"
          size="small"
        />
        <Typography variant="body2" fontWeight="bold">
          {label}: {checked ? "ON" : "OFF"}
        </Typography>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", ml: 6, mt: -0.5 }}
      >
        {description}
      </Typography>
    </Box>
  );
}

export default function SettingsDialogRuntimeTab({
  configDraft,
  onReinitialize,
  reinitializing,
  resetSandbox,
  resettingSandboxAccount,
  setConfigDraft,
  syncOnlineStorageToLocal,
  syncingOnlineStorage,
}: SettingsDialogRuntimeTabProps) {
  const [syncOnlineBaseUrl, setSyncOnlineBaseUrl] = useState(
    DEFAULT_SYNC_ONLINE_BASE_URL,
  );

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <SettingsDialogSection
          title="Automation"
          description="Controls whether the slow engine loops on its own and whether entries and exits can happen automatically."
        >
          <Stack spacing={2}>
            <RuntimeToggle
              checked={configDraft.runnerEnabled}
              label="Runner"
              description="When ON, the background scheduler keeps scanning and executing on its normal cadence."
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev ? { ...prev, runnerEnabled: checked } : prev,
                )
              }
            />

            <RuntimeToggle
              checked={configDraft.autoEntryEnabled}
              label="Auto Entry"
              description="When ON, qualifying signals can open positions without manual intervention."
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev ? { ...prev, autoEntryEnabled: checked } : prev,
                )
              }
            />

            <SettingsInfoField
              label="Daily PnL Auto-Entry Stop (USDT)"
              type="number"
              size="small"
              fullWidth
              value={configDraft.autoEntryDailyPnlLimitUSDT ?? -50}
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        autoEntryDailyPnlLimitUSDT: Math.min(
                          0,
                          Number(event.target.value),
                        ),
                      }
                    : prev,
                )
              }
              slotProps={{
                htmlInput: {
                  max: 0,
                  step: "1",
                },
              }}
              info="Pauses automatic entries when the current UTC-day USD PnL shown in the navbar is at or below this value. Wins and losses are netted; this is not accumulated losses. Exits and manual entries remain available."
            />

            <RuntimeToggle
              checked={configDraft.autoExitEnabled}
              label="Auto Exit"
              description="When ON, TP and SL management can close positions automatically."
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev ? { ...prev, autoExitEnabled: checked } : prev,
                )
              }
            />

            <RuntimeToggle
              checked={configDraft.entrySignalBypass}
              label="Entry Signal Bypass"
              description="When ON, the normal signal gate is relaxed for automatic entries. Manual entry already overrides the normal verification path."
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev ? { ...prev, entrySignalBypass: checked } : prev,
                )
              }
            />
          </Stack>
        </SettingsDialogSection>

        <SettingsDialogSection
          title="Monitoring"
          description="Controls the independent production stage cadences and the time bucket used to retain each open position's PnL history."
        >
          <RuntimeMonitoringSettings
            configDraft={configDraft}
            setConfigDraft={setConfigDraft}
          />
        </SettingsDialogSection>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <SettingsDialogSection
          title="Sandbox Accounts"
          description="Each account independently chooses live or sandbox execution and owns its sandbox starting balance."
        >
          <Stack spacing={2}>
            {(configDraft.exchangeAccounts ?? []).map((account) => {
              const resetting = resettingSandboxAccount === account.slug;
              return (
                <Box
                  key={account.slug}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1.5,
                    p: 2,
                  }}
                >
                  <Stack spacing={2}>
                    <Box>
                      <Typography fontWeight={700} variant="subtitle2">
                        {account.name}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                        {account.slug}
                      </Typography>
                    </Box>

                    <RuntimeToggle
                      checked={account.sandbox.enabled}
                      label={`${account.name} Sandbox Mode`}
                      description="When ON, this account simulates orders locally and sends no live exchange orders."
                      onChange={(checked) =>
                        setConfigDraft((prev) =>
                          prev
                            ? updateAccountSettingsInConfigDraft(
                                prev,
                                account.slug,
                                (accountDraft) => ({
                                  ...accountDraft,
                                  sandboxEnabled: checked,
                                }),
                              )
                            : prev,
                        )
                      }
                    />

                    <SettingsInfoField
                      label={`${account.name} Sandbox Initial Balance (USDT)`}
                      type="number"
                      size="small"
                      fullWidth
                      value={account.sandbox.initialBalanceUSDT}
                      onChange={(event) =>
                        setConfigDraft((prev) =>
                          prev
                            ? updateAccountSettingsInConfigDraft(
                                prev,
                                account.slug,
                                (accountDraft) => ({
                                  ...accountDraft,
                                  sandboxInitialBalanceUSDT:
                                    event.target.value,
                                }),
                              )
                            : prev,
                        )
                      }
                      info="Used when this account's sandbox state is initialized or reset."
                    />

                    <Box>
                      <Button
                        color="warning"
                        variant="outlined"
                        startIcon={<RestartAltIcon />}
                        onClick={() => {
                          void resetSandbox(account.slug);
                        }}
                        disabled={
                          resettingSandboxAccount !== null ||
                          !account.sandbox.enabled
                        }
                      >
                        {resetting
                          ? "Resetting..."
                          : `Reset ${account.name} Sandbox`}
                      </Button>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 1 }}
                      >
                        Rebuilds only this account&apos;s sandbox positions and
                        balance. Its live state and every other account are not
                        touched.
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </SettingsDialogSection>

        <SettingsDialogSection
          title="Dashboard Data"
          description="Rebuilds dashboard-derived cache data for the active exchange."
        >
          <Box>
            <Button
              color="warning"
              variant="outlined"
              startIcon={
                reinitializing ? (
                  <CircularProgress size={16} />
                ) : (
                  <RefreshIcon />
                )
              }
              onClick={() => {
                void onReinitialize();
              }}
              disabled={reinitializing}
            >
              {reinitializing ? "Reinitializing..." : "Reinitialize Dashboard"}
            </Button>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              Removes cached SLOW volatility files and the price-normalization
              map, then reloads storage, refreshes 24h volume and market cap
              snapshots, regenerates volatility data for configured coins,
              rebuilds price normalization, and refreshes the chart/table
              response. This is separate from normal dashboard fetching.
            </Typography>
          </Box>
        </SettingsDialogSection>

        <SettingsDialogSection
          title="Debugging"
          description="Clone persistent storage from another dashboard server for debugging."
        >
          <Box>
            <SettingsInfoField
              label="Source Server Base URL"
              size="small"
              fullWidth
              value={syncOnlineBaseUrl}
              onChange={(event) => {
                setSyncOnlineBaseUrl(event.target.value);
              }}
              info="Dashboard URL to clone persistent storage from. Example: https://wealth.reinventwp.com"
              sx={{ mb: 1.5 }}
            />

            <Button
              color="warning"
              variant="outlined"
              startIcon={<CloudDownloadIcon />}
              onClick={() => {
                void syncOnlineStorageToLocal(syncOnlineBaseUrl);
              }}
              disabled={syncingOnlineStorage || !syncOnlineBaseUrl.trim()}
            >
              {syncingOnlineStorage
                ? "Syncing..."
                : "Clone Storage to This Server"}
            </Button>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              {`Fetches the full persistent storage export from ${syncOnlineBaseUrl.trim() || DEFAULT_SYNC_ONLINE_BASE_URL}, creates a timestamped backup of this server, then replaces this server's persistent storage. If the source dashboard is protected, configure the same SYNC_TOKEN on both servers.`}
            </Typography>
          </Box>
        </SettingsDialogSection>
      </Grid>
    </Grid>
  );
}
