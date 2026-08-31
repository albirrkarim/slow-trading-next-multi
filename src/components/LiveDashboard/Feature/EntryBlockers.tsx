"use client";

import { endpoints } from "@/components/endpoints";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { SlowTradingEntryDiagnostic } from "@/lib/slowTrading/client";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
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

interface EntryDiagnosticsResponse {
  diagnostics: SlowTradingEntryDiagnostic[];
  generatedAt: number;
}

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
  const [diagnostics, setDiagnostics] = useState<SlowTradingEntryDiagnostic[]>(
    [],
  );
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const response = await axios.get<EntryDiagnosticsResponse>(
        endpoints.slow.prod.entryDiagnostics,
      );
      setDiagnostics(response.data.diagnostics);
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
          Latest actionable coins
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
        <Paper
          sx={{ color: "error.main", p: 1.25 }}
          variant="outlined"
        >
          <Typography variant="body2">{error}</Typography>
        </Paper>
      )}

      {!error && loading && diagnostics.length === 0 && (
        <Paper sx={{ p: 1.5, textAlign: "center" }} variant="outlined">
          <Typography color="text.secondary" variant="body2">
            Evaluating current entry decisions...
          </Typography>
        </Paper>
      )}

      {!error && !loading && diagnostics.length === 0 && (
        <Paper sx={{ p: 1.5, textAlign: "center" }} variant="outlined">
          <Typography color="text.secondary" variant="body2">
            No coins currently meet the minimum actionable level.
          </Typography>
        </Paper>
      )}

      {!error && diagnostics.length > 0 && (
        <Stack
          spacing={0.75}
          sx={{ maxHeight: 480, overflowY: "auto", pr: 0.25 }}
        >
          {diagnostics.map((diagnostic) => {
            const ready = diagnostic.status === "ready";
            return (
              <Paper
                key={`${diagnostic.symbol}-${diagnostic.pointId}`}
                sx={{
                  borderLeft: 3,
                  borderLeftColor: ready ? "success.main" : "warning.main",
                  p: 1,
                }}
                variant="outlined"
              >
                <Box
                  sx={{
                    alignItems: "center",
                    display: "flex",
                    gap: 0.75,
                    mb: 0.5,
                  }}
                >
                  {ready ? (
                    <CheckCircleOutlineIcon
                      color="success"
                      fontSize="small"
                    />
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
                  {diagnostic.reason}
                </Typography>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
