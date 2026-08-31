"use client";

import { useState } from "react";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  Chip,
  type ChipProps,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import Link from "next/link";
import blackSwanModel, {
  type BlackSwanConfig,
  type BlackSwanStatus,
} from "@/lib/trading/black-swan";
import SettingsDialogSection from "./SettingsDialogSection";
import SettingsInfoField from "./SettingsInfoField";
import BlackSwanSavingsPreview from "./BlackSwanSavingsPreview";
import type { ConfigDraft, ConfigDraftSetter, DashboardState } from "./types";

const STATUS_STEPS = [
  {
    status: "NORMAL",
    color: "success",
    description: "Normal entries, exits, and averaging continue.",
  },
  {
    status: "WATCH",
    color: "warning",
    description: "New entries and averaging pause while BTC is under warning.",
  },
  {
    status: "CRISIS",
    color: "error",
    description: "The selected emergency policy is applied to open positions.",
  },
  {
    status: "RECOVERY",
    color: "secondary",
    description:
      "Risk stays paused until cooldown and acknowledgement complete.",
  },
] as const;

const EXIT_POLICY_DETAILS: Record<
  BlackSwanConfig["exitPolicy"],
  { severity: "info" | "warning" | "error"; text: string }
> = {
  FREEZE_ONLY: {
    severity: "info",
    text: "Pauses entries and averaging, but leaves every open position to its existing exit rules.",
  },
  CLOSE_ADVERSE: {
    severity: "warning",
    text: "Recommended for downward-crash protection: closes LONG futures and managed spot positions while preserving SHORT hedges.",
  },
  FLATTEN_ALL: {
    severity: "error",
    text: "Closes every managed open position, including profitable SHORT hedges. Use only when you want maximum exposure reduction.",
  },
};

function Field(props: {
  info: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  integer?: boolean;
}) {
  return (
    <SettingsInfoField
      fullWidth
      info={props.info}
      label={props.label}
      onChange={(event) => props.onChange(Number(event.target.value))}
      size="small"
      slotProps={{
        htmlInput: {
          min: props.integer ? 1 : 0.1,
          step: props.integer ? 1 : 0.1,
        },
      }}
      type="number"
      value={props.value}
    />
  );
}

function statusColor(status: BlackSwanStatus): ChipProps["color"] {
  if (status === "NORMAL") return "success";
  if (status === "WATCH") return "warning";
  if (status === "CRISIS") return "error";
  return "secondary";
}

export default function BlackSwanSettings({
  configDraft,
  dashboardState,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
  setConfigDraft: ConfigDraftSetter;
}) {
  const update = (blackSwan: BlackSwanConfig) =>
    setConfigDraft((previous) =>
      previous ? { ...previous, blackSwan } : previous,
    );
  const config = blackSwanModel.config.normalize(configDraft.blackSwan);
  const currentState = blackSwanModel.state.normalize(dashboardState.blackSwan);
  const exitPolicyDetails = EXIT_POLICY_DETAILS[config.exitPolicy];
  // PROD:BLACK_SWAN_SAVINGS_PREVIEW_RESOURCE_GUARD
  const [showSavingsPreview, setShowSavingsPreview] = useState(false);

  return (
    <Grid alignItems="flex-start" container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Box sx={{ minWidth: 0 }}>
          <SettingsDialogSection
            title="Portfolio crash protection"
            description="A separate one-minute Risk Sentinel watches BTC first, confirms wider market stress when needed, and temporarily controls whether the portfolio may add risk."
          >
            <Stack spacing={2}>
              <Box
                sx={{
                  alignItems: { xs: "flex-start", md: "center" },
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  gap: 2,
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.enabled}
                        onChange={(event) =>
                          update({ ...config, enabled: event.target.checked })
                        }
                      />
                    }
                    label={
                      <Typography fontWeight={700}>
                        Black Swan Protection: {config.enabled ? "ON" : "OFF"}
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                  <Stack
                    alignItems="center"
                    direction="row"
                    flexWrap="wrap"
                    gap={1}
                    sx={{ mt: 0.75 }}
                  >
                    <Typography color="text.secondary" variant="body2">
                      Current {dashboardState.activeMode} state
                    </Typography>
                    <Chip
                      color={statusColor(currentState.status)}
                      label={currentState.status}
                      size="small"
                    />
                    <Chip
                      label={currentState.reason}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </Box>

                <Button
                  component={Link}
                  endIcon={<OpenInNewIcon />}
                  href="/dev/black-swan"
                  rel="noreferrer"
                  target="_blank"
                  variant="outlined"
                >
                  Open candle backtest
                </Button>
              </Box>

              <Alert severity={config.enabled ? "success" : "warning"}>
                {config.enabled
                  ? "Protection is enabled. WATCH, CRISIS, and RECOVERY block every new entry and averaging action; risk-reducing exits continue."
                  : "Protection is disabled. The Risk Sentinel will not block entries, pause averaging, or apply emergency exits during a market-wide crash."}
              </Alert>

              <Box
                aria-label="Black Swan protection state flow"
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(4, minmax(0, 1fr))",
                  },
                }}
              >
                {STATUS_STEPS.map((step, index) => (
                  <Box
                    key={step.status}
                    sx={(theme) => ({
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 1.5,
                      p: 1.5,
                    })}
                  >
                    <Stack alignItems="center" direction="row" gap={1}>
                      <Typography color="text.secondary" variant="caption">
                        {index + 1}
                      </Typography>
                      <Chip
                        color={step.color}
                        label={step.status}
                        size="small"
                        variant={
                          step.status === currentState.status
                            ? "filled"
                            : "outlined"
                        }
                      />
                    </Stack>
                    <Typography
                      color="text.secondary"
                      sx={{ mt: 1 }}
                      variant="body2"
                    >
                      {step.description}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gap: 1.5,
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
                }}
              >
                <Field
                  integer
                  info="Independent Risk Sentinel cadence. One minute is recommended."
                  label="Risk Sentinel Interval (Minutes)"
                  onChange={(value) =>
                    setConfigDraft((previous) =>
                      previous
                        ? { ...previous, blackSwanStageIntervalMinutes: value }
                        : previous,
                    )
                  }
                  value={configDraft.blackSwanStageIntervalMinutes ?? 1}
                />
                <Field
                  integer
                  info="BTC evidence older than this enters fail-closed WATCH, but stale data never causes a blind emergency exit."
                  label="Maximum Data Age (Minutes)"
                  onChange={(value) =>
                    update({ ...config, maxDataAgeMinutes: value })
                  }
                  value={config.maxDataAgeMinutes}
                />
              </Box>
            </Stack>
          </SettingsDialogSection>

          <SettingsDialogSection
            title="Crisis response and recovery"
            description="Choose what happens to existing positions after CRISIS is confirmed, and how cautiously the system resumes trading."
          >
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gap: 1.5,
                  gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                }}
              >
                <SettingsInfoField
                  fullWidth
                  info="Controls which existing positions are closed during a confirmed downward market crisis."
                  label="Emergency Exit Policy"
                  onChange={(event) =>
                    update({
                      ...config,
                      exitPolicy: event.target
                        .value as BlackSwanConfig["exitPolicy"],
                    })
                  }
                  select
                  size="small"
                  value={config.exitPolicy}
                >
                  <MenuItem value="FREEZE_ONLY">
                    Freeze only — do not emergency close
                  </MenuItem>
                  <MenuItem value="CLOSE_ADVERSE">
                    Close adverse — preserve SHORT hedges
                  </MenuItem>
                  <MenuItem value="FLATTEN_ALL">
                    Flatten all — close every position
                  </MenuItem>
                </SettingsInfoField>
                <Field
                  integer
                  info="Entries and averaging remain blocked for this continuous healthy period after the warning or crisis clears."
                  label="Recovery Cooldown (Minutes)"
                  onChange={(value) =>
                    update({ ...config, recoveryCooldownMinutes: value })
                  }
                  value={config.recoveryCooldownMinutes}
                />
              </Box>

              <Alert severity={exitPolicyDetails.severity}>
                {exitPolicyDetails.text}
              </Alert>

              <FormControlLabel
                control={
                  <Switch
                    checked={config.requireManualLiveRecovery}
                    onChange={(event) =>
                      update({
                        ...config,
                        requireManualLiveRecovery: event.target.checked,
                      })
                    }
                  />
                }
                label="Require manual acknowledgement before LIVE trading resumes"
              />
              <Typography color="text.secondary" variant="caption">
                Sandbox may recover automatically after cooldown. When enabled
                for live mode, an operator must also acknowledge RECOVERY from
                the dashboard banner.
              </Typography>
            </Stack>
          </SettingsDialogSection>

          <SettingsDialogSection
            title="BTC warning and crisis thresholds"
            description="BTC is the primary trigger. Warning thresholds pause new risk; hard thresholds enter CRISIS immediately without waiting for altcoin confirmation."
          >
            <Stack spacing={2}>
              <Alert severity="info">
                Enter positive drawdown magnitudes: <strong>4</strong> means BTC
                has fallen <strong>-4%</strong> from the highest closed-candle
                close in that window.
              </Alert>

              <Box>
                <Typography fontWeight={700} sx={{ mb: 1 }} variant="body2">
                  WATCH thresholds — either one pauses entries and averaging
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.5,
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
                  }}
                >
                  <Field
                    info="Enters WATCH when BTC reaches this 5-minute closed-candle drawdown."
                    label="Warning 5m (%)"
                    onChange={(value) =>
                      update({
                        ...config,
                        btcWarning: {
                          ...config.btcWarning,
                          fiveMinuteDrawdownPct: value,
                        },
                      })
                    }
                    value={config.btcWarning.fiveMinuteDrawdownPct}
                  />
                  <Field
                    info="Enters WATCH when BTC reaches this 15-minute closed-candle drawdown."
                    label="Warning 15m (%)"
                    onChange={(value) =>
                      update({
                        ...config,
                        btcWarning: {
                          ...config.btcWarning,
                          fifteenMinuteDrawdownPct: value,
                        },
                      })
                    }
                    value={config.btcWarning.fifteenMinuteDrawdownPct}
                  />
                </Box>
              </Box>

              <Box>
                <Typography fontWeight={700} sx={{ mb: 1 }} variant="body2">
                  CRISIS thresholds — any one applies the emergency policy
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.5,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    },
                  }}
                >
                  <Field
                    info="Enters CRISIS immediately; breadth confirmation is not required."
                    label="Hard 5m (%)"
                    onChange={(value) =>
                      update({
                        ...config,
                        btcHardTrigger: {
                          ...config.btcHardTrigger,
                          fiveMinuteDrawdownPct: value,
                        },
                      })
                    }
                    value={config.btcHardTrigger.fiveMinuteDrawdownPct}
                  />
                  <Field
                    info="Enters CRISIS immediately; breadth confirmation is not required."
                    label="Hard 15m (%)"
                    onChange={(value) =>
                      update({
                        ...config,
                        btcHardTrigger: {
                          ...config.btcHardTrigger,
                          fifteenMinuteDrawdownPct: value,
                        },
                      })
                    }
                    value={config.btcHardTrigger.fifteenMinuteDrawdownPct}
                  />
                  <Field
                    info="Longer-window direct CRISIS threshold."
                    label="Hard 60m (%)"
                    onChange={(value) =>
                      update({
                        ...config,
                        btcHardTrigger: {
                          ...config.btcHardTrigger,
                          sixtyMinuteDrawdownPct: value,
                        },
                      })
                    }
                    value={config.btcHardTrigger.sixtyMinuteDrawdownPct}
                  />
                </Box>
              </Box>
            </Stack>
          </SettingsDialogSection>

          <SettingsDialogSection
            title="Altcoin breadth confirmation"
            description="After BTC reaches WATCH, the sentinel checks whether enough configured non-BTC symbols are falling together. A single altcoin crash cannot activate global protection."
          >
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
              }}
            >
              <Field
                integer
                info="Closed-candle window used for each configured non-BTC symbol."
                label="Breadth Window (Minutes)"
                onChange={(value) =>
                  update({
                    ...config,
                    breadthConfirmation: {
                      ...config.breadthConfirmation,
                      windowMinutes: value,
                    },
                  })
                }
                value={config.breadthConfirmation.windowMinutes}
              />
              <Field
                info="A valid altcoin counts as affected at or below this drawdown."
                label="Altcoin Drawdown (%)"
                onChange={(value) =>
                  update({
                    ...config,
                    breadthConfirmation: {
                      ...config.breadthConfirmation,
                      altDrawdownPct: value,
                    },
                  })
                }
                value={config.breadthConfirmation.altDrawdownPct}
              />
              <Field
                info="Required affected share among configured symbols with fresh valid data."
                label="Affected Symbols (%)"
                onChange={(value) =>
                  update({
                    ...config,
                    breadthConfirmation: {
                      ...config.breadthConfirmation,
                      affectedSymbolsPct: value,
                    },
                  })
                }
                value={config.breadthConfirmation.affectedSymbolsPct}
              />
              <Field
                integer
                info="Breadth cannot confirm CRISIS with fewer fresh symbols."
                label="Minimum Valid Symbols"
                onChange={(value) =>
                  update({
                    ...config,
                    breadthConfirmation: {
                      ...config.breadthConfirmation,
                      minimumValidSymbols: value,
                    },
                  })
                }
                value={config.breadthConfirmation.minimumValidSymbols}
              />
            </Box>
          </SettingsDialogSection>
        </Box>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Stack spacing={1.5}>
          <FormControlLabel
            control={
              <Switch
                checked={showSavingsPreview}
                onChange={(event) =>
                  setShowSavingsPreview(event.target.checked)
                }
              />
            }
            label="Load Black Swan live preview"
          />
          {showSavingsPreview ? (
            <BlackSwanSavingsPreview
              configDraft={configDraft}
              dashboardState={dashboardState}
            />
          ) : (
            <Alert severity="info">
              The historical replay is off. Enable it only when you want to
              run the resource-intensive Black Swan comparison.
            </Alert>
          )}
        </Stack>
      </Grid>
    </Grid>
  );
}
