"use client";

import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useEffect, useState } from "react";

import { endpoints } from "@/components/endpoints";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import blackSwanModel, {
  type BlackSwanReason,
  type BlackSwanStatus,
} from "@/lib/trading/black-swan";

const MINUTE_MS = 60_000;
type StatusColor = "error" | "info" | "success" | "warning";

const REASON_EXPLANATIONS: Record<BlackSwanReason, string> = {
  DISABLED:
    "Protection is disabled, so market conditions are not used to block entries or averaging.",
  HEALTHY:
    "BTC and market breadth are within the configured protection thresholds. Trading can continue normally.",
  DATA_STALE:
    "Recent BTC candle data is missing or stale. New entries and averaging stay blocked until fresh data arrives.",
  BTC_WARNING:
    "BTC crossed a warning threshold. The system is watching for broader market confirmation while blocking new risk.",
  BTC_HARD_TRIGGER:
    "BTC crossed a hard drawdown threshold, so crisis protection activated immediately.",
  SYSTEMIC_BREADTH:
    "A BTC warning together with broad altcoin drawdowns confirmed a market-wide selloff.",
  COOLDOWN:
    "The trigger has cleared, but new entries and averaging remain blocked during the recovery cooldown.",
  MANUAL_ACK_REQUIRED:
    "Market conditions are healthy and the cooldown is complete. Live trading remains blocked until recovery is acknowledged.",
};

function statusColor(status: BlackSwanStatus): StatusColor {
  if (status === "NORMAL") return "success";
  if (status === "CRISIS") return "error";
  if (status === "RECOVERY") return "info";
  return "warning";
}

/** Formats detector percentages while preserving unavailable evidence. */
function formatPct(value: number | undefined, digits: number): string {
  return value === undefined ? "—" : `${value.toFixed(digits)}%`;
}

/** Formats a live elapsed duration without showing noisy seconds. */
function formatElapsed(from: number, now: number): string {
  if (!(from > 0) || !(now >= from)) return "Not available";

  const elapsedMinutes = Math.floor((now - from) / MINUTE_MS);
  if (elapsedMinutes < 1) return "Less than a minute";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** Formats a persisted detector timestamp for the operator's local timezone. */
function formatTime(value: number | undefined): string {
  return value && value > 0
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "short",
      }).format(new Date(value))
    : "Not yet";
}

function TimingItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography color="text.secondary" display="block" variant="caption">
        {label}
      </Typography>
      <Typography
        sx={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
        variant="body2"
      >
        {value}
      </Typography>
    </Box>
  );
}

function Evidence({ state }: { state: SlowTradingDashboardState }) {
  const evidence = state.blackSwan.evidence;
  if (!evidence) return null;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      divider={
        <Box
          aria-hidden
          sx={{
            alignSelf: "stretch",
            borderColor: "divider",
            borderLeftStyle: { xs: "none", sm: "solid" },
            borderLeftWidth: { xs: 0, sm: 1 },
          }}
        />
      }
      gap={{ xs: 0.5, sm: 1.5 }}
    >
      <Typography color="text.secondary" variant="body2">
        BTC drawdown: 5m {formatPct(evidence.btc[5]?.pct, 2)} · 15m{" "}
        {formatPct(evidence.btc[15]?.pct, 2)} · 60m{" "}
        {formatPct(evidence.btc[60]?.pct, 2)}
      </Typography>
      {evidence.breadth && (
        <Typography color="text.secondary" variant="body2">
          Market breadth: {evidence.breadth.pct.toFixed(1)}% affected ({
            evidence.breadth.affected
          }
          /{evidence.breadth.valid})
        </Typography>
      )}
    </Stack>
  );
}

export default function BlackSwanStatusSection({
  state,
  onRefresh,
}: {
  state: SlowTradingDashboardState;
  onRefresh: () => Promise<void>;
}) {
  const [acknowledging, setAcknowledging] = useState(false);
  const [now, setNow] = useState(0);
  const protectionActive = state.blackSwan.status !== "NORMAL";
  const color = statusColor(state.blackSwan.status);
  const config = blackSwanModel.config.normalize(state.config.blackSwan);

  useEffect(() => {
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function acknowledge() {
    setAcknowledging(true);
    try {
      await axios.post(endpoints.slow.prod.blackSwan, {
        action: "acknowledge-recovery",
      });
      await onRefresh();
    } finally {
      setAcknowledging(false);
    }
  }

  const cooldownEnd = state.blackSwan.recoverySince
    ? state.blackSwan.recoverySince +
      config.recoveryCooldownMinutes * MINUTE_MS
    : undefined;

  return (
    // PROD:BLACK_SWAN_RISK_SENTINEL
    <Paper
      aria-label="Live Black Swan decision"
      aria-live="polite"
      component="section"
      sx={(theme) => ({
        borderColor: theme.palette[color].main,
        borderLeftWidth: 4,
        mb: 2,
        overflow: "hidden",
        p: { xs: 1.5, sm: 2 },
      })}
      variant="outlined"
    >
      <Stack gap={1.25}>
        <Stack
          alignItems={{ xs: "flex-start", sm: "center" }}
          direction={{ xs: "column", sm: "row" }}
          gap={1}
          justifyContent="space-between"
        >
          <Stack alignItems="center" direction="row" flexWrap="wrap" gap={1}>
            <ShieldOutlinedIcon color={color} />
            <Typography fontWeight={800} variant="h6">
              Black Swan Risk Sentinel
            </Typography>
            <Chip color={color} label={state.blackSwan.status} size="small" />
            <Chip
              label={`Reason: ${state.blackSwan.reason.replaceAll("_", " ")}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={state.activeMode.toUpperCase()}
              size="small"
              variant="outlined"
            />
          </Stack>

          {state.activeMode === "live" &&
            state.blackSwan.status === "RECOVERY" && (
              <Button
                color={color}
                disabled={acknowledging}
                onClick={() => void acknowledge()}
                size="small"
                variant="outlined"
              >
                {acknowledging ? "Acknowledging…" : "Acknowledge recovery"}
              </Button>
            )}
        </Stack>

        <Box>
          <Typography fontWeight={700} variant="body1">
            {protectionActive
              ? "Entries and averaging are blocked"
              : "Trading is operating normally"}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {REASON_EXPLANATIONS[state.blackSwan.reason]}
          </Typography>
        </Box>

        <Evidence state={state} />

        <Stack alignItems="center" direction="row" gap={0.75}>
          <AccessTimeOutlinedIcon color="action" fontSize="small" />
          <Typography color="text.secondary" fontWeight={700} variant="caption">
            Decision timing
          </Typography>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <TimingItem
            label="State since"
            value={`${formatTime(state.blackSwan.since)}${
              now > 0 && state.blackSwan.since > 0
                ? ` · ${formatElapsed(state.blackSwan.since, now)}`
                : ""
            }`}
          />
          <TimingItem
            label="Last evaluated"
            value={formatTime(state.blackSwan.t)}
          />
          <TimingItem
            label="Evaluation cadence"
            value={`Every ${state.runtime.blackSwanStageIntervalMinutes}m`}
          />
          {state.blackSwan.status === "RECOVERY" && cooldownEnd && (
            <TimingItem
              label="Recovery cooldown"
              value={
                now === 0
                  ? "Calculating…"
                  : now >= cooldownEnd
                    ? "Complete"
                    : `${formatElapsed(now, cooldownEnd)} remaining`
              }
            />
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
