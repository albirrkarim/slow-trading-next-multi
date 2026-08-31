"use client";

import { Box, Grid, MenuItem, Stack } from "@mui/material";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";

import ExitStrategyReference from "./ExitStrategyReference";
import SettingsCheckbox from "./SettingsCheckbox";
import SettingsGroup from "./SettingsGroup";
import SettingsInfoField from "./SettingsInfoField";
import TradingSettingsPreview from "./TradingSettingsPreview";
import type { ConfigDraft, ConfigDraftSetter, DashboardState } from "./types";
import {
  applyAccountProfileToConfigDraft,
  updateAccountSettingsInConfigDraft,
} from "./helpers";

interface SettingsDialogTradingTabProps {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
  setConfigDraft: ConfigDraftSetter;
}

function TradingAccountSettings({
  accountSelector,
  configDraft,
  dashboardState,
  setConfigDraft,
}: SettingsDialogTradingTabProps & { accountSelector?: React.ReactNode }) {
  const averagingEnabled = configDraft.enableWatchLogic ?? false;
  const adaptiveConfig = adaptiveAveraging.config.normalize(
    configDraft.adaptiveAveraging,
    false,
  );
  return (
    <Grid container spacing={3} alignItems="flex-start">
      <Grid size={{ xs: 12, sm: 12, md: 6, lg: 6 }}>
        <Stack gap={3} sx={{ minWidth: 0 }}>
          {accountSelector && (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              {accountSelector}
            </Box>
          )}
          <SettingsGroup title="Entry">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Max Open Positions"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.maxOpenPositions ?? 0}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            maxOpenPositions: Math.max(
                              0,
                              Math.floor(Number(event.target.value) || 0),
                            ),
                          }
                        : prev,
                    )
                  }
                  slotProps={{
                    htmlInput: {
                      step: "1",
                      inputMode: "numeric",
                      min: 0,
                    },
                  }}
                  info="Maximum number of positions that may be open at once in the active mode. Set 0 to disable this guard."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Max Entry 24h Vol %"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.maxEntryBased24HourVolPct ?? 0.2}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            maxEntryBased24HourVolPct: Number(
                              event.target.value,
                            ),
                          }
                        : prev,
                    )
                  }
                  info="Liquidity cap for entry sizing. Example: 24h quote volume 1,000,000 and value 0.2 means SLOW sizes entry + reserves inside a temporary 2,000 USDT budget. The real spendable balance above that stays untouched. Set 0 to disable."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Max Entry Margin %"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.maxEntryMarginPct ?? 0}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            maxEntryMarginPct: Number(event.target.value),
                          }
                        : prev,
                    )
                  }
                  info="Maximum percent of spendable balance that one entry plus its reserve may consume. Example: spendable 1,000 and cap 20 means entry + reserved averaging cannot exceed 200. Set 0 to disable."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Max Entry Margin (USDT)"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.maxEntryMargin ?? 0}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            maxEntryMargin: Number(event.target.value),
                          }
                        : prev,
                    )
                  }
                  info="Hard USDT cap for one entry margin. Example: engine wants 80 USDT but this is 50, so SLOW uses at most 50. Set 0 to use engine calculation."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Min Actionable Absolute Level"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.minActionableAbsoluteLevel}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            minActionableAbsoluteLevel: Math.max(
                              1,
                              Math.floor(Number(event.target.value) || 0),
                            ),
                          }
                        : prev,
                    )
                  }
                  slotProps={{
                    htmlInput: {
                      step: "1",
                      inputMode: "numeric",
                      min: 1,
                    },
                  }}
                  info="Minimum absolute vPoint level decision.v19 or decision.v20 may enter. Default 2; minimum 1. Only decision.v19 treats the level immediately below this value as a projection candidate."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Max Leverage"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.maxLeverage ?? 0}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? { ...prev, maxLeverage: Number(event.target.value) }
                        : prev,
                    )
                  }
                  info="Maximum futures leverage allowed. Example: engine chooses 5x but this is 3, so the order is capped at 3x. Set 0 to use engine calculation."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  label="Exact Leverage"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.exactLeverage ?? 0}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            exactLeverage: Math.max(
                              0,
                              Math.floor(Number(event.target.value) || 0),
                            ),
                          }
                        : prev,
                    )
                  }
                  slotProps={{
                    htmlInput: {
                      step: "1",
                      inputMode: "numeric",
                      min: 0,
                    },
                  }}
                  info="Forces every futures entry to use this leverage, overriding the engine and Max Leverage values. Set 0 to use the normal calculation. Spot always uses 1x."
                />
              </Grid>
            </Grid>
          </SettingsGroup>

          <SettingsGroup
            title={
              <SettingsCheckbox
                checked={averagingEnabled}
                info="Master switch for automatic watch/add-position averaging. When disabled, SLOW skips averaging and the settings in this section are inactive."
                label="Averaging"
                labelFontWeight={700}
                labelVariant="subtitle1"
                onChange={(checked) =>
                  setConfigDraft((prev) =>
                    prev ? { ...prev, enableWatchLogic: checked } : prev,
                  )
                }
              />
            }
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  disabled={!averagingEnabled}
                  label="Reserve Next Levels"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.watchReserveLevels ?? 2}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            watchReserveLevels: Number(event.target.value),
                          }
                        : prev,
                    )
                  }
                  info="How many next averaging steps should reserve balance. Example: current entry level 4 and value 2 means reserve for level 5 and 6 adds. Set 0 to disable."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  disabled={!averagingEnabled}
                  label="Reserve Multiplier"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.watchReservePctAlloc ?? 2}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            watchReservePctAlloc: Number(event.target.value),
                          }
                        : prev,
                    )
                  }
                  info="Multiplier for each reserved averaging step. Example: entry margin 10 and multiplier 2 reserves 20 for the first add; if total margin becomes 30, the next reserved add can be 60."
                />
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <SettingsInfoField
                  disabled={!averagingEnabled}
                  label="Max Next Averaging Levels"
                  type="number"
                  size="small"
                  fullWidth
                  value={configDraft.watchMaxNextAveragingLevels ?? 2}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            watchMaxNextAveragingLevels: Number(
                              event.target.value,
                            ),
                          }
                        : prev,
                    )
                  }
                  info="Relative cap for automatic averaging. Example: entry at level 4 and max 2 means watch logic may add on level 5 and 6, but not 7. Set 0 to disable."
                />
              </Grid>
            </Grid>

            <SettingsCheckbox
              checked={
                configDraft.averagingRescueProjectionGuardEnabled ?? true
              }
              disabled={!averagingEnabled}
              info="When ON, an averaging attempt must improve the weighted entry and reach the projected rescue-profit target. When OFF, failure of that projection does not block the normal watch-step margin."
              label="Averaging Rescue Projection Guard"
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        averagingRescueProjectionGuardEnabled: checked,
                      }
                    : prev,
                )
              }
            />

            <SettingsCheckbox
              checked={adaptiveConfig.enabled}
              disabled={!averagingEnabled}
              info="When ON, SLOW can raise the averaging multiplier above the reserve multiplier when enough spendable balance exists and the configured projected-profit target can be reached."
              label="Adaptive Averaging"
              onChange={(checked) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        adaptiveAveraging: {
                          ...adaptiveAveraging.config.normalize(
                            prev.adaptiveAveraging,
                            false,
                          ),
                          enabled: checked,
                        },
                      }
                    : prev,
                )
              }
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  disabled={!averagingEnabled || !adaptiveConfig.enabled}
                  fullWidth
                  info="Highest multiplier the adaptive search may try. The normal reserve multiplier is always evaluated first."
                  label="Adaptive Max Multiplier"
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            adaptiveAveraging: {
                              ...adaptiveAveraging.config.normalize(
                                prev.adaptiveAveraging,
                                false,
                              ),
                              maxMultiplier: Math.max(
                                1,
                                Math.floor(Number(event.target.value) || 0),
                              ),
                            },
                          }
                        : prev,
                    )
                  }
                  size="small"
                  slotProps={{
                    htmlInput: { inputMode: "numeric", min: 1, step: "1" },
                  }}
                  type="number"
                  value={adaptiveConfig.maxMultiplier}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  disabled={!averagingEnabled || !adaptiveConfig.enabled}
                  fullWidth
                  info="Minimum projected position profit required at the rescue target anchored to the triggering vPoint."
                  label="Adaptive Minimum Projected Profit %"
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            adaptiveAveraging: {
                              ...adaptiveAveraging.config.normalize(
                                prev.adaptiveAveraging,
                                false,
                              ),
                              minProjectedProfitPct: Math.max(
                                0,
                                Number(event.target.value) || 0,
                              ),
                            },
                          }
                        : prev,
                    )
                  }
                  size="small"
                  slotProps={{
                    htmlInput: { inputMode: "decimal", min: 0, step: "0.1" },
                  }}
                  type="number"
                  value={adaptiveConfig.minProjectedProfitPct}
                />
              </Grid>
            </Grid>
          </SettingsGroup>

          <SettingsGroup title="Exit">
            <ExitStrategyReference
              configDraft={configDraft}
              setConfigDraft={setConfigDraft}
            />
          </SettingsGroup>
        </Stack>
      </Grid>

      <Grid size={{ xs: 12, sm: 12, md: 6, lg: 6 }}>
        <TradingSettingsPreview
          configDraft={configDraft}
          dashboardState={dashboardState}
        />
      </Grid>
    </Grid>
  );
}

export default function SettingsDialogTradingTab({
  configDraft,
  dashboardState,
  setConfigDraft,
}: SettingsDialogTradingTabProps) {
  const setSelectedAccountDraft: ConfigDraftSetter = (value) => {
    setConfigDraft((current) => {
      if (!current || current.exchangeAccounts.length === 0) {
        return typeof value === "function" ? value(current) : value;
      }

      return updateAccountSettingsInConfigDraft(
        current,
        current.exchangeAccountSlug,
        (currentAccountDraft) => {
          const next =
            typeof value === "function" ? value(currentAccountDraft) : value;
          return next ?? currentAccountDraft;
        },
      );
    });
  };

  return (
    <TradingAccountSettings
      accountSelector={
        configDraft.exchangeAccounts.length > 0 ? (
          <SettingsInfoField
            info="Chooses which account's Trading configuration is shown in this editor. It does not control which accounts execute."
            label="Editing Account"
            onChange={(event) => {
              const account = configDraft.exchangeAccounts.find(
                (candidate) => candidate.slug === event.target.value,
              );
              setConfigDraft((current) =>
                current && account
                  ? applyAccountProfileToConfigDraft(current, account)
                  : current,
              );
            }}
            select
            size="small"
            sx={{ width: { xs: "100%", sm: 240 } }}
            value={configDraft.exchangeAccountSlug}
          >
            {configDraft.exchangeAccounts.map((account) => (
              <MenuItem key={account.slug} value={account.slug}>
                {account.name}
              </MenuItem>
            ))}
          </SettingsInfoField>
        ) : undefined
      }
      configDraft={configDraft}
      dashboardState={dashboardState}
      setConfigDraft={setSelectedAccountDraft}
    />
  );
}
