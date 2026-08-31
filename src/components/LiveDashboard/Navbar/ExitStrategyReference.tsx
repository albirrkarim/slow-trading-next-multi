"use client";

import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import { Box, Grid, Stack, Typography } from "@mui/material";

import PostAverageRescueExitSettings from "./PostAverageRescueExitSettings";
import PostAverageStopLossSettings from "./PostAverageStopLossSettings";
import ReadMoreDialogButton from "./ReadMoreDialogButton";
import SettingsCheckbox from "./SettingsCheckbox";
import SettingsInfoField from "./SettingsInfoField";
import SettingsRuleAccordion from "./SettingsRuleAccordion";
import type { ConfigDraft, ConfigDraftSetter } from "./types";

const STOP_LOSS_PLUS_INFO =
  "Trailing profit lock after TP tracking starts. With TP 2% and retrace 1%, the initial exit threshold is 1%. The threshold rises with every higher profit peak.";

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function SidewaysExitDetails() {
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="body2">
        This setting lets SLOW close one sideways open position when a better
        opportunity needs room. It only marks the position for normal exit;
        entry signals are not deleted or mutated.
      </Typography>

      <Box>
        <Typography fontWeight={700} gutterBottom variant="body2">
          Sideways definition
        </Typography>
        <Typography color="text.secondary" variant="body2">
          A position is sideways when its net PnL after fees is between -1% and
          +1%.
        </Typography>
      </Box>

      <Box>
        <Typography fontWeight={700} gutterBottom variant="body2">
          Worker-freeing path
        </Typography>
        <Typography color="text.secondary" variant="body2">
          When available workers cannot afford a strong Speed Tier 1 or 2
          candidate at level 4 or higher, SLOW may close a slower sideways
          position. Speed Tier 3 can be freed for Speed Tier 1 or 2. Speed Tier
          2 can be freed for Speed Tier 1. Speed Tier 1 is not closed by this
          path.
        </Typography>
      </Box>

      <Box>
        <Typography fontWeight={700} gutterBottom variant="body2">
          Aged-sideways path
        </Typography>
        <Typography color="text.secondary" variant="body2">
          If a sideways position has been open for at least 2 days, another coin
          at level 4 or higher can close it when the candidate Speed Tier is
          better or equal. This covers cases like a Speed Tier 1 position
          staying flat while another Speed Tier 1 level-4 opportunity appears.
        </Typography>
      </Box>

      <Box>
        <Typography fontWeight={700} gutterBottom variant="body2">
          Late-entry protection
        </Typography>
        <Typography color="text.secondary" variant="body2">
          In production, the aged-sideways path only allows the close when the
          strong candidate passes the late-entry vPoint price drift guard. If
          price has already moved more than 1% in the profit direction from the
          vPoint, SLOW will not close the old position for that candidate.
        </Typography>
      </Box>
    </Box>
  );
}

export default function ExitStrategyReference({
  configDraft,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
}) {
  const takeProfitPct = configDraft.modelConfig.takeProfitPercent ?? 0;
  const stopLossPct = configDraft.modelConfig.stopLossPercent;
  const exitOnVPointAbsLevel =
    configDraft.modelConfig.exitOnVPointAbsLevel ?? 0;
  const stopLossUSDT = configDraft.modelConfig.stopLossUSDT ?? 50;
  const targetZoneStopLossPct =
    configDraft.modelConfig.volatilityTargetStopLossPercent ?? 0;
  const stopLossPlusEnabled = Boolean(configDraft.modelConfig.useStopLossPlus);
  const stopLossPlusTriggerPct =
    configDraft.modelConfig.stopLossPlusTrigger ?? 1;
  const sidewaysEnabled = Boolean(
    configDraft.exitSidewaysToFreeWorkersForStrongCandidates,
  );
  const postAverageRescueExit = configDraft.modelConfig.postAverageRescueExit;
  const postAverageStopLoss = configDraft.modelConfig.postAverageStopLoss;
  const updateModelConfig = (
    patch: Partial<typeof configDraft.modelConfig>,
  ) => {
    setConfigDraft((previous) =>
      previous
        ? {
            ...previous,
            modelConfig: {
              ...previous.modelConfig,
              ...patch,
            },
          }
        : previous,
    );
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography fontWeight={700} variant="body2">
          Shared Exit Target
        </Typography>
        <Typography
          color="text.secondary"
          display="block"
          mb={1.5}
          variant="caption"
        >
          This profit target is shared by StopLoss+ and the traditional
          take-profit fallback.
        </Typography>
        <SettingsInfoField
          fullWidth
          info="Target profit percentage for automatic exits. Example: long entry at 100 and TP 5 targets about 105 before fees; short entry at 100 targets about 95."
          label="Take Profit %"
          onChange={(event) =>
            updateModelConfig({
              takeProfitPercent: parseNumber(event.target.value),
            })
          }
          size="small"
          type="number"
          value={takeProfitPct}
        />
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
        <Stack alignItems="center" direction="row" gap={0.75}>
          <RuleOutlinedIcon color="action" fontSize="small" />
          <Typography fontWeight={700} variant="body2">
            Automatic Exit Order
          </Typography>
        </Stack>
        <Typography
          color="text.secondary"
          display="block"
          mt={0.25}
          variant="caption"
        >
          The first matching rule exits the position. This order follows the
          production executor.
        </Typography>

        <Box mt={0.5}>
          <SettingsRuleAccordion
            behavior="A position already queued by the worker-freeing or aged-sideways rule is force-sold before the normal automatic exit checks."
            name="Queued sideways worker release"
            number={1}
            status={sidewaysEnabled ? "Enabled" : "Disabled"}
            tc="BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES"
          >
            <SettingsCheckbox
              action={
                <ReadMoreDialogButton
                  dialogTitle="Exit Sideways For Strong Candidates"
                  tooltip="Read more about sideways exits"
                >
                  <SidewaysExitDetails />
                </ReadMoreDialogButton>
              }
              checked={sidewaysEnabled}
              info="When ON, SLOW can close one sideways position for a strong level-4+ candidate when the worker-freeing or aged-sideways rules are met."
              label="Exit Sideways For Strong Candidates"
              onChange={(checked) =>
                setConfigDraft((previous) =>
                  previous
                    ? {
                        ...previous,
                        exitSidewaysToFreeWorkersForStrongCandidates: checked,
                      }
                    : previous,
                )
              }
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="Exits when the latest volatility point reaches or exceeds the configured absolute level."
            name="Exit on absolute vPoint level"
            number={2}
            status={
              exitOnVPointAbsLevel > 0
                ? `At |level| >= ${exitOnVPointAbsLevel}`
                : "Disabled"
            }
            tc="PROD:EXIT_ON_VPOINT_LEVEL"
          >
            <SettingsInfoField
              fullWidth
              info="Exit when the latest vPoint absolute level reaches this value. Example: 6 exits at level -6 or +6. Set 0 to disable."
              label="Exit On Absolute vPoint Level"
              onChange={(event) =>
                updateModelConfig({
                  exitOnVPointAbsLevel: Math.max(
                    0,
                    Math.floor(parseNumber(event.target.value)),
                  ),
                })
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "numeric",
                  min: 0,
                  step: "1",
                },
              }}
              type="number"
              value={exitOnVPointAbsLevel}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="Exits when fee-adjusted net USDT PnL reaches the configured loss amount."
            name="Stop loss by net USDT loss"
            number={3}
            status={stopLossUSDT > 0 ? `At -$${stopLossUSDT}` : "Disabled"}
            tc="BOTH:STOP_LOSS_BY_USDT_LOSS"
          >
            <SettingsInfoField
              fullWidth
              info="Maximum fee-adjusted net USDT loss for one open position. Enter 50 to exit at -$50 net PnL. Set 0 to disable."
              label="Stop Loss By Net USDT Loss"
              onChange={(event) =>
                updateModelConfig({
                  stopLossUSDT: Math.max(0, parseNumber(event.target.value)),
                })
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  min: 0,
                  step: "1",
                },
              }}
              type="number"
              value={stopLossUSDT}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="Exits when fee-adjusted net PnL reaches the configured negative stop-loss percentage."
            name="Hard stop loss"
            number={4}
            status={stopLossPct ? `At -${stopLossPct}%` : "Disabled"}
            tc="BOTH:TRADITIONAL_TP_SL"
          >
            <SettingsInfoField
              fullWidth
              info="Hard stop-loss percentage. Example: long entry at 100 and SL 20 exits around 80; short entry at 100 exits around 120. Leave empty or set 0 to disable."
              label="Stop Loss %"
              onChange={(event) =>
                updateModelConfig({
                  stopLossPercent: Number(event.target.value) || undefined,
                })
              }
              size="small"
              slotProps={{
                htmlInput: {
                  step: "1",
                  inputMode: "decimal",
                  min: 0,
                  max: 99,
                },
              }}
              type="number"
              value={stopLossPct ?? ""}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="After the opposite volatility target zone is hit, exits when fee-adjusted unlevered PnL reaches this tighter negative threshold."
            name="Volatility target-zone stop loss"
            number={5}
            status={
              targetZoneStopLossPct > 0
                ? `At -${targetZoneStopLossPct}%`
                : "Disabled"
            }
            tc="BOTH:VOLATILITY_TARGET_SL_VALUE"
          >
            <SettingsInfoField
              fullWidth
              info="Additional stop loss enabled only after the opposite volatility target zone has been hit. It uses fee-adjusted, unlevered PnL from the weighted entry. Enter 2 to exit at -2%; set 0 to disable."
              label="Target-Zone Stop Loss %"
              onChange={(event) =>
                updateModelConfig({
                  volatilityTargetStopLossPercent: parseNumber(
                    event.target.value,
                  ),
                })
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  max: 99,
                  min: 0,
                  step: "0.1",
                },
              }}
              type="number"
              value={targetZoneStopLossPct}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="When favorable distance reaches the global volatility threshold, exits when fee-aware net PnL reaches the configured threshold for the completed averaging count."
            name="Post-average rescue exit"
            number={6}
            status={
              postAverageRescueExit?.enabled === false ? "Disabled" : "Enabled"
            }
            tc="BOTH:POST_AVERAGE_RESCUE_EXIT"
          >
            <PostAverageRescueExitSettings
              onChange={(nextConfig) =>
                updateModelConfig({ postAverageRescueExit: nextConfig })
              }
              value={postAverageRescueExit}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="After averaging, exits at the first active fee-aware net PnL percentage or USDT loss boundary selected for the completed averaging count."
            name="Post-average stop loss"
            number={7}
            status={postAverageStopLoss?.enabled ? "Enabled" : "Disabled"}
            tc="BOTH:POST_AVERAGE_STOP_LOSS"
          >
            <PostAverageStopLossSettings
              onChange={(nextConfig) =>
                updateModelConfig({ postAverageStopLoss: nextConfig })
              }
              value={postAverageStopLoss}
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior={`Activates at TP ${takeProfitPct}% and exits after profit retraces ${stopLossPlusTriggerPct}% from the recorded peak.`}
            name="StopLoss+ trailing exit"
            number={8}
            status={stopLossPlusEnabled ? "Enabled" : "Disabled"}
            tc="PROD:SL_PLUS"
          >
            <Grid alignItems="flex-start" container spacing={1.5}>
              <Grid size={{ xs: 12 }}>
                <SettingsCheckbox
                  checked={stopLossPlusEnabled}
                  info={STOP_LOSS_PLUS_INFO}
                  label="Use StopLoss+"
                  onChange={(checked) =>
                    updateModelConfig({ useStopLossPlus: checked })
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <SettingsInfoField
                  disabled={!stopLossPlusEnabled}
                  fullWidth
                  info="After Take Profit % activates StopLoss+, this net-profit retrace from the recorded peak triggers an exit. Enter 1 for a 1 percentage-point retrace. With TP 2%, the initial minimum threshold is 2% - 1% = 1%, then it rises with higher peaks."
                  label="StopLoss+ Retrace Trigger %"
                  onChange={(event) =>
                    updateModelConfig({
                      stopLossPlusTrigger: parseNumber(event.target.value),
                    })
                  }
                  size="small"
                  slotProps={{
                    htmlInput: {
                      inputMode: "decimal",
                      max: 100,
                      min: 0,
                      step: "0.1",
                    },
                  }}
                  type="number"
                  value={stopLossPlusTriggerPct}
                />
              </Grid>
            </Grid>
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            behavior="Exits with remaining positive fee-adjusted profit after the opposite volatility target zone appears following entry."
            name="Volatility target-zone TP"
            number={9}
            status="Automatic"
            tc="BOTH:VOLATILITY_TARGET_TP"
          />

          <SettingsRuleAccordion
            behavior="Final fallback when StopLoss+ is off: TP must be reached and the opposite volatility target zone must be confirmed."
            name="Traditional TP fallback"
            number={10}
            status={stopLossPlusEnabled ? "Disabled by StopLoss+" : "Enabled"}
            tc="BOTH:TRADITIONAL_TP_SL"
          />
        </Box>
      </Box>
    </Stack>
  );
}
