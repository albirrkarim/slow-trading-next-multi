"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { BlackSwanBacktestResult } from "@/lib/devBacktest/black-swan";
import blackSwan from "@/lib/trading/black-swan";
import ConfigPanel, { type BlackSwanBacktestForm } from "./ConfigPanel";
import BlackSwanCharts from "./Charts";

const DEFAULT_SYMBOLS = "BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, LINK, AAVE";

function localInput(t: number) {
  const date = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

const initialForm: BlackSwanBacktestForm = {
  symbolsText: DEFAULT_SYMBOLS,
  startTime: localInput(Date.parse("2025-10-10T18:00:00Z")),
  endTime: localInput(Date.parse("2025-10-11T12:00:00Z")),
  useCache: true,
  config: { ...blackSwan.config.defaults, enabled: true },
};

function Summary({ result }: { result: BlackSwanBacktestResult }) {
  const items = [
    ["Closed candles", result.summary.candleCount.toLocaleString()],
    ["Worst BTC 60m", `${result.summary.maxDrawdownPct.toFixed(2)}%`],
    ["Maximum breadth", `${result.summary.maxBreadthPct.toFixed(1)}%`],
    ["Watch", `${result.summary.watchMinutes} min`],
    ["Crisis", `${result.summary.crisisMinutes} min`],
    ["Protected", `${result.summary.protectiveMinutes} min`],
  ];
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
          xl: "repeat(6, minmax(0, 1fr))",
        },
      }}
    >
      {items.map(([label, value]) => (
        <Paper key={label} variant="outlined" sx={{ p: 1.75 }}>
          <Typography color="text.secondary" variant="caption">
            {label}
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {value}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

export default function BlackSwanBacktestPage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<BlackSwanBacktestResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/slow-trading/storage", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((state) => {
        setForm((current) => ({
          ...current,
          symbolsText: Array.isArray(state.config?.symbols)
            ? state.config.symbols.join(", ")
            : current.symbolsText,
          config: {
            ...blackSwan.config.normalize(state.config?.blackSwan),
            enabled: true,
          },
        }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function run() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/dev/black-swan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: form.symbolsText
            .split(",")
            .map((symbol) => symbol.trim())
            .filter(Boolean),
          startTime: new Date(form.startTime).getTime(),
          endTime: new Date(form.endTime).getTime(),
          config: form.config,
          useCache: form.useCache,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Backtest failed");
      }
      setResult(data as BlackSwanBacktestResult);
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Backtest failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minWidth: 0,
        p: { xs: 2, md: 3 },
        display: "grid",
        gap: 2.5,
        gridTemplateColumns: "minmax(0, 1fr)",
        width: "100%",
      }}
    >
      <Box>
        <Typography component="h1" variant="h4" fontWeight={800}>
          Black Swan candle backtest
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          A dedicated no-lookahead replay for systemic crash protection. This
          page uses raw closed 1-minute candles; the vPoint strategy backtest
          remains unchanged.
        </Typography>
      </Box>
      <ConfigPanel
        disabled={loading}
        form={form}
        onChange={setForm}
        onRun={() => void run()}
      />
      {loading && (
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={24} />
          <Typography>
            Downloading or reading raw candles and replaying each closed minute…
          </Typography>
        </Paper>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {result && !loading && (
        <>
          <Summary result={result} />
          <BlackSwanCharts result={result} />
          <Paper component="section" variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
              State transitions
            </Typography>
            {result.transitions.length === 0 ? (
              <Alert severity="info">
                No protection-state transition occurred with these thresholds.
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Time</TableCell>
                      <TableCell>Transition</TableCell>
                      <TableCell>Reason</TableCell>
                      <TableCell>BTC 5m</TableCell>
                      <TableCell>BTC 15m</TableCell>
                      <TableCell>BTC 60m</TableCell>
                      <TableCell>Breadth</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.transitions.map((transition) => (
                      <TableRow key={`${transition.t}-${transition.to}`}>
                        <TableCell>
                          {new Date(transition.t).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={`${transition.from} → ${transition.to}`}
                            size="small"
                            color={
                              transition.to === "CRISIS"
                                ? "error"
                                : transition.to === "WATCH"
                                  ? "warning"
                                  : "default"
                            }
                          />
                        </TableCell>
                        <TableCell>{transition.reason}</TableCell>
                        <TableCell>
                          {transition.btc5Pct?.toFixed(2) ?? "—"}%
                        </TableCell>
                        <TableCell>
                          {transition.btc15Pct?.toFixed(2) ?? "—"}%
                        </TableCell>
                        <TableCell>
                          {transition.btc60Pct?.toFixed(2) ?? "—"}%
                        </TableCell>
                        <TableCell>
                          {transition.breadthPct === undefined
                            ? "—"
                            : `${transition.breadthPct.toFixed(1)}% (${transition.breadthAffected}/${transition.breadthValid})`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
