"use client";

import { endpoints } from "@/components/endpoints";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type {
  SlowTradingAccountEntryDiagnostics,
  SlowTradingEntryDiagnostic,
  SlowTradingEntryDiagnosticsSnapshot,
  SlowTradingSharedEntryGuardDiagnostic,
} from "@/lib/slowTrading/client";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useEffect, useState } from "react";

export default function EntryBlockers() {
  return (
    <HeaderMetrics
      defaultExpanded
      headerCanBeClicked
      rememberExpand="entry-blockers"
      title={
        <Typography fontWeight="bold" variant="body1">
          Entry Decisions
        </Typography>
      }
    >
      {(expanded) => expanded && <EntryBlockersContent />}
    </HeaderMetrics>
  );
}

function EntryBlockersContent() {
  const [accounts, setAccounts] = useState<
    SlowTradingAccountEntryDiagnostics[]
  >([]);
  const [sharedGuards, setSharedGuards] = useState<
    SlowTradingSharedEntryGuardDiagnostic[]
  >([]);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const response = await axios.get<SlowTradingEntryDiagnosticsSnapshot>(
        endpoints.slow.prod.entryDiagnostics,
      );
      setAccounts(response.data.accounts);
      setSharedGuards(response.data.sharedGuards);
      setGeneratedAt(response.data.generatedAt);
    } catch (refreshError: any) {
      setError(
        refreshError?.response?.data?.error ??
          "Could not load entry decisions.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <Box sx={{ mt: 0.5 }}>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          mb: 0.75,
        }}
      >
        <Typography color="text.secondary" variant="caption">
          Shared controls and per-account decisions
          {generatedAt > 0 &&
            ` · checked ${new Date(generatedAt).toLocaleTimeString()}`}
        </Typography>
        <Tooltip title="Refresh entry decisions">
          <span>
            <IconButton
              aria-label="Refresh entry decisions"
              disabled={loading}
              onClick={(event) => {
                event.stopPropagation();
                void refresh();
              }}
              size="small"
            >
              {loading ? (
                <CircularProgress size={16} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error && (
        <Paper sx={{ color: "error.main", p: 1.25 }} variant="outlined">
          <Typography variant="body2">{error}</Typography>
        </Paper>
      )}

      {!error && sharedGuards.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1 }}>
          {sharedGuards.map((guard) => (
            <Tooltip key={guard.code} title={guard.reason}>
              <Chip
                color={guard.status === "ready" ? "success" : "warning"}
                label={guard.code === "RUNNER_ENABLED" ? "Runner" : "Auto Entry"}
                size="small"
                variant="outlined"
              />
            </Tooltip>
          ))}
        </Stack>
      )}

      {!error && loading && accounts.length === 0 && (
        <Paper sx={{ p: 1.5, textAlign: "center" }} variant="outlined">
          <Typography color="text.secondary" variant="body2">
            Evaluating current entry decisions...
          </Typography>
        </Paper>
      )}

      {!error && !loading && accounts.length === 0 && (
        <Paper sx={{ p: 1.5, textAlign: "center" }} variant="outlined">
          <Typography color="text.secondary" variant="body2">
            No enabled accounts are available for entry diagnostics.
          </Typography>
        </Paper>
      )}

      {!error && accounts.length > 0 && (
        <Stack
          spacing={1.25}
          sx={{ maxHeight: 560, overflowY: "auto", pr: 0.25 }}
        >
          {accounts.map((account) => (
            <AccountEntryDiagnostics
              account={account}
              key={account.account.slug}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function AccountEntryDiagnostics({
  account,
}: {
  account: SlowTradingAccountEntryDiagnostics;
}) {
  return (
    <Box>
      <Stack alignItems="center" direction="row" gap={0.75} sx={{ mb: 0.75 }}>
        <AccountCircleOutlinedIcon color="action" fontSize="small" />
        <Typography fontWeight={700} variant="body2">
          {account.account.name}
        </Typography>
      </Stack>

      {account.latestExecutionError && (
        <Paper
          sx={{
            borderLeft: 3,
            borderLeftColor: "error.main",
            mb: 0.75,
            p: 1,
          }}
          variant="outlined"
        >
          <Stack alignItems="center" direction="row" gap={0.75} sx={{ mb: 0.4 }}>
            <ErrorOutlineIcon color="error" fontSize="small" />
            <Typography color="error.main" fontWeight={700} variant="caption">
              Latest account execution failure
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ ml: "auto" }}
              variant="caption"
            >
              {new Date(
                account.latestExecutionError.createdAt,
              ).toLocaleTimeString()}
            </Typography>
          </Stack>
          <Typography color="text.secondary" variant="caption">
            {account.latestExecutionError.message}
          </Typography>
        </Paper>
      )}

      {account.diagnosticError && (
        <Paper sx={{ color: "error.main", mb: 0.75, p: 1 }} variant="outlined">
          <Typography variant="caption">{account.diagnosticError}</Typography>
        </Paper>
      )}

      {!account.diagnosticError && account.diagnostics.length === 0 && (
        <Typography color="text.secondary" variant="caption">
          No coins currently meet this account&apos;s minimum actionable level.
        </Typography>
      )}

      <Stack spacing={0.75}>
        {account.diagnostics.map((diagnostic) => (
          <EntryDiagnosticCard
            diagnostic={diagnostic}
            key={`${account.account.slug}-${diagnostic.symbol}-${diagnostic.pointId}`}
          />
        ))}
      </Stack>
    </Box>
  );
}

function EntryDiagnosticCard({
  diagnostic,
}: {
  diagnostic: SlowTradingEntryDiagnostic;
}) {
  const ready = diagnostic.status === "ready";
  return (
    <Paper
      sx={{
        borderLeft: 3,
        borderLeftColor: ready ? "success.main" : "warning.main",
        p: 1,
      }}
      variant="outlined"
    >
      <Box sx={{ alignItems: "center", display: "flex", gap: 0.75, mb: 0.5 }}>
        {ready ? (
          <CheckCircleOutlineIcon color="success" fontSize="small" />
        ) : (
          <WarningAmberIcon color="warning" fontSize="small" />
        )}
        <Typography fontWeight={700} variant="body2">
          {diagnostic.symbol}
        </Typography>
        <Typography color="text.secondary" variant="caption">
          Level {diagnostic.level}
        </Typography>
        <Chip
          color={ready ? "success" : "warning"}
          label={ready ? "Ready" : "Blocked"}
          size="small"
          sx={{ height: 20, ml: "auto" }}
          variant="outlined"
        />
      </Box>
      <Typography color="text.secondary" variant="caption">
        [{diagnostic.code}] {diagnostic.reason}
      </Typography>
    </Paper>
  );
}
