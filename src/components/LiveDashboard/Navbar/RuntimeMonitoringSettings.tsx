"use client";

import { Box, Divider, Stack, Typography } from "@mui/material";

import SettingsInfoField from "./SettingsInfoField";
import SettingsRuleAccordion from "./SettingsRuleAccordion";
import type { ConfigDraft, ConfigDraftSetter } from "./types";

function StageHeading({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  return (
    <Box>
      <Typography fontWeight={700} variant="body2">
        {label}
      </Typography>
      <Typography color="text.secondary" variant="caption">
        {description}
      </Typography>
    </Box>
  );
}

function updateWholeMinutes(
  setConfigDraft: ConfigDraftSetter,
  key:
    | "captureEntryStageIntervalMinutes"
    | "managementStageIntervalMinutes"
    | "pnlHistoryBucketMinutes"
    | "speedupStageIntervalMinutes"
    | "standardMonitoringStageIntervalMinutes",
  value: string,
) {
  setConfigDraft((previous) =>
    previous
      ? {
          ...previous,
          [key]: Math.max(1, Math.floor(Number(value) || 1)),
        }
      : previous,
  );
}

export default function RuntimeMonitoringSettings({
  configDraft,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
}) {
  const takeProfitPct = configDraft.modelConfig?.takeProfitPercent ?? 0;
  const stopLossPlusEnabled = Boolean(configDraft.modelConfig?.useStopLossPlus);

  return (
    <Stack spacing={2.5}>
      <Stack spacing={1.5}>
        <StageHeading
          label="A. Speedup Stage"
          description="Monitors urgent open positions on the fastest cadence. A position enters this stage when any rule below matches."
        />
        <SettingsInfoField
          label="Speedup Stage Interval (Minutes)"
          type="number"
          size="small"
          fullWidth
          value={configDraft.speedupStageIntervalMinutes ?? 1}
          onChange={(event) =>
            updateWholeMinutes(
              setConfigDraft,
              "speedupStageIntervalMinutes",
              event.target.value,
            )
          }
          slotProps={{
            htmlInput: { step: "1", inputMode: "numeric", min: 1 },
          }}
          info="Monitoring cadence for positions that match at least one Speedup rule. Default 1 minute."
        />

        <Box>
          <Typography color="text.secondary" variant="overline">
            Entry rules (OR)
          </Typography>

          <SettingsRuleAccordion
            number={1}
            name="Positive PnL threshold"
            behavior="Enters Speedup when persisted fee-aware net PnL is at or above this percentage."
          >
            <SettingsInfoField
              label="Positive PnL Threshold (%)"
              type="number"
              size="small"
              fullWidth
              value={configDraft.speedupStagePositivePnlThresholdPct ?? 1.5}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setConfigDraft((previous) =>
                  previous
                    ? {
                        ...previous,
                        speedupStagePositivePnlThresholdPct: Number.isFinite(
                          parsed,
                        )
                          ? Math.max(0, parsed)
                          : 1.5,
                      }
                    : previous,
                );
              }}
              slotProps={{
                htmlInput: { step: "0.1", inputMode: "decimal", min: 0 },
              }}
              info="Default 1.5%."
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            number={2}
            name="Negative PnL threshold"
            behavior="Enters Speedup when persisted fee-aware net PnL is at or below the negative value of this loss magnitude."
          >
            <SettingsInfoField
              label="Negative PnL Threshold (%)"
              type="number"
              size="small"
              fullWidth
              value={configDraft.speedupStageNegativePnlThresholdPct ?? 1.5}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setConfigDraft((previous) =>
                  previous
                    ? {
                        ...previous,
                        speedupStageNegativePnlThresholdPct: Number.isFinite(
                          parsed,
                        )
                          ? Math.max(0, parsed)
                          : 1.5,
                      }
                    : previous,
                );
              }}
              slotProps={{
                htmlInput: { step: "0.1", inputMode: "decimal", min: 0 },
              }}
              info="Enter a positive magnitude. Default 1.5%."
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            number={3}
            name="StopLoss+ armed"
            status={`StopLoss+ ${stopLossPlusEnabled ? "ON" : "OFF"} | TP ${takeProfitPct}%`}
            behavior="Enters Speedup when StopLoss+ is enabled and the position's persisted maximum run-up has reached the configured take-profit percentage."
          />

          <SettingsRuleAccordion
            number={4}
            name="Near take profit"
            status={`TP ${takeProfitPct}%`}
            behavior="Enters Speedup when fee-aware net PnL reaches the configured take profit minus this proximity offset, with a minimum threshold of 0%."
          >
            <SettingsInfoField
              label="Take Profit Proximity Offset (%)"
              type="number"
              size="small"
              fullWidth
              value={configDraft.speedupStageTakeProfitOffsetPct ?? 0.5}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setConfigDraft((previous) =>
                  previous
                    ? {
                        ...previous,
                        speedupStageTakeProfitOffsetPct: Number.isFinite(parsed)
                          ? Math.max(0, parsed)
                          : 0.5,
                      }
                    : previous,
                );
              }}
              slotProps={{
                htmlInput: { step: "0.1", inputMode: "decimal", min: 0 },
              }}
              info="Default 0.5 percentage points before take profit."
            />
          </SettingsRuleAccordion>

          <SettingsRuleAccordion
            number={5}
            name="Post-average target approach"
            status="Uses volatility threshold"
            behavior="After at least one averaging execution, enters Speedup when favorable drift from the latest vPoint is greater than VOLATILITY_THRESHOLD / 2."
          />

          <SettingsRuleAccordion
            number={6}
            name="Target vPoint hit"
            behavior="Enters Speedup after the first post-entry direction-specific target vPoint: TOP for LONG or BOTTOM for SHORT."
          />
        </Box>
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        <StageHeading
          label="B. Standard Monitoring"
          description="Monitors every open position that matches no Speedup rule. Refreshed state can promote a position into Speedup on the next Speedup pass."
        />
        <SettingsInfoField
          label="Standard Monitoring Interval (Minutes)"
          type="number"
          size="small"
          fullWidth
          value={configDraft.standardMonitoringStageIntervalMinutes ?? 5}
          onChange={(event) =>
            updateWholeMinutes(
              setConfigDraft,
              "standardMonitoringStageIntervalMinutes",
              event.target.value,
            )
          }
          slotProps={{
            htmlInput: { step: "1", inputMode: "numeric", min: 1 },
          }}
          info="Default 5 minutes."
        />
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        <StageHeading
          label="C. Management"
          description="Evaluates configured coins for automatic removal independently from entry capture. Only its short, revalidated config update is serialized with trading mutations."
        />
        <SettingsInfoField
          label="Management Cycle Interval (Minutes)"
          type="number"
          size="small"
          fullWidth
          value={configDraft.managementStageIntervalMinutes ?? 5}
          onChange={(event) =>
            updateWholeMinutes(
              setConfigDraft,
              "managementStageIntervalMinutes",
              event.target.value,
            )
          }
          slotProps={{
            htmlInput: { step: "1", inputMode: "numeric", min: 1 },
          }}
          info="Runs Coin Management rules for live and sandbox without waiting on Capture Entry. Default 5 minutes."
        />
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        <StageHeading
          label="D. Capture Entry"
          description="Scans configured coins without an open position for new entry candidates. It does not monitor open positions."
        />
        <SettingsInfoField
          label="Capture Entry Interval (Minutes)"
          type="number"
          size="small"
          fullWidth
          value={configDraft.captureEntryStageIntervalMinutes ?? 5}
          onChange={(event) =>
            updateWholeMinutes(
              setConfigDraft,
              "captureEntryStageIntervalMinutes",
              event.target.value,
            )
          }
          slotProps={{
            htmlInput: { step: "1", inputMode: "numeric", min: 1 },
          }}
          info="Default 5 minutes."
        />
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        <StageHeading
          label="E. PnL History"
          description="Controls how open-position PnL observations are retained. It does not increase monitoring frequency."
        />
        <SettingsInfoField
          label="PnL History Bucket (Minutes)"
          type="number"
          size="small"
          fullWidth
          value={configDraft.pnlHistoryBucketMinutes ?? 60}
          onChange={(event) =>
            updateWholeMinutes(
              setConfigDraft,
              "pnlHistoryBucketMinutes",
              event.target.value,
            )
          }
          slotProps={{
            htmlInput: { step: "1", inputMode: "numeric", min: 1 },
          }}
          info="Keeps the latest observation in each bucket. Default 60 minutes."
        />
      </Stack>
    </Stack>
  );
}
