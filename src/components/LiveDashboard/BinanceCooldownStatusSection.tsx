"use client";

import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

/** Formats a runtime timestamp explicitly in Jakarta time. */
function formatJakartaTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: JAKARTA_TIME_ZONE,
  }).format(value);
}

/** Formats a positive cooldown duration for compact status copy. */
function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function BinanceCooldownStatusSection({
  state,
}: {
  state: SlowTradingDashboardState;
}) {
  const [now, setNow] = useState(0);
  const health = state.binanceHealth ?? { current: null, logs: [] };
  const active = Boolean(health.current && health.current.retryAt > now);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => setNow(Date.now()), 0);
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    // PROD:BINANCE_PERSISTENT_COOLDOWN
    <Box
      aria-label="Binance REST health"
      aria-live="polite"
      component="section"
      sx={{ mb: 2 }}
    >
      <HeaderMetrics
        defaultExpanded={active}
        headerCanBeClicked
        rememberExpand="binance-rest-health"
        title={
          <Stack alignItems="center" direction="row" flexWrap="wrap" gap={1}>
            {active ? (
              <WarningAmberRoundedIcon color="error" fontSize="small" />
            ) : (
              <CheckCircleOutlineIcon color="success" fontSize="small" />
            )}
            <Typography fontWeight="bold" variant="body1">
              Binance REST Health
            </Typography>
            <Chip
              color={active ? "error" : "success"}
              label={active ? "COOLDOWN" : "HEALTHY"}
              size="small"
            />
            {active && health.current && (
              <Chip
                label={`${formatRemaining(health.current.retryAt - now)} remaining`}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        }
      >
        {(expanded) =>
          expanded && (
            <Stack
              gap={1.5}
              sx={(theme) => ({
                border: `1px solid ${
                  active
                    ? theme.palette.error.main
                    : theme.palette.success.main
                }`,
                borderLeftWidth: 4,
                borderRadius: 1,
                mt: 1,
                p: { xs: 1.5, sm: 2 },
              })}
            >
              {health.current && active ? (
                <Box>
                  <Typography color="error.main" fontWeight={700} variant="body2">
                    All Binance REST requests are blocked locally until the ban ends.
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Start: {formatJakartaTime(health.current.startedAt)} WIB
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    End: {formatJakartaTime(health.current.retryAt)} WIB
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Trigger: {health.current.kind} {health.current.endpoint}
                  </Typography>
                  <Typography sx={{ mt: 0.5, overflowWrap: "anywhere" }} variant="caption">
                    {health.current.reason}
                  </Typography>
                </Box>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  No Binance REST cooldown is active.
                </Typography>
              )}

              <Stack alignItems="center" direction="row" gap={0.75}>
                <AccessTimeOutlinedIcon color="action" fontSize="small" />
                <Typography color="text.secondary" fontWeight={700} variant="caption">
                  Recent cooldown logs
                </Typography>
              </Stack>

              {health.logs.slice(0, 10).map((log) => (
                <Box
                  key={log.id}
                  sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}
                >
                  <Typography fontWeight={700} variant="body2">
                    {formatJakartaTime(log.t)} WIB → {formatJakartaTime(log.end)} WIB
                  </Typography>
                  <Typography color="text.secondary" variant="caption">
                    {log.kind} {log.endpoint} · {log.occurrences} detection
                    {log.occurrences === 1 ? "" : "s"}
                  </Typography>
                  <Typography
                    display="block"
                    sx={{ overflowWrap: "anywhere" }}
                    variant="caption"
                  >
                    {log.reason}
                  </Typography>
                </Box>
              ))}

              {health.logs.length === 0 && (
                <Typography color="text.secondary" variant="caption">
                  No cooldown incidents have been recorded.
                </Typography>
              )}
            </Stack>
          )
        }
      </HeaderMetrics>
    </Box>
  );
}
