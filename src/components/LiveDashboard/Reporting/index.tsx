"use client";

import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import {
  Box,
  Button,
  Grid,
  Tab,
  Tabs,
} from "@mui/material";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import { ChartsSection } from "./ChartsSection";
import TradeOutcomeEvaluationSection from "./LossEvaluationSection";
import { SummarySection } from "./SummarySection";
import { TradesTableSection } from "./TradesTableSection";
import MaxUpDistributionChart from "./MaxUpDistributionChart";
import { endpoints } from "@/components/endpoints";

type TradeHistoryView = "all" | "losses" | "profits";

/** Identifies a losing closed trade using USDT PnL with percent fallback. */
function isLosingTrade(
  trade: SlowTradingDashboardState["history"][number],
): boolean {
  if (typeof trade.pnl.netUsdt === "number" && Number.isFinite(trade.pnl.netUsdt)) {
    return trade.pnl.netUsdt < 0;
  }

  return (
    typeof trade.pnl.netPct === "number" &&
    Number.isFinite(trade.pnl.netPct) &&
    trade.pnl.netPct < 0
  );
}

/** Identifies a profitable closed trade using USDT PnL with percent fallback. */
function isProfitableTrade(
  trade: SlowTradingDashboardState["history"][number],
): boolean {
  if (typeof trade.pnl.netUsdt === "number" && Number.isFinite(trade.pnl.netUsdt)) {
    return trade.pnl.netUsdt > 0;
  }

  return (
    typeof trade.pnl.netPct === "number" &&
    Number.isFinite(trade.pnl.netPct) &&
    trade.pnl.netPct > 0
  );
}

export default function SlowTradingReporting({
  dashboardState,
  onRefresh,
}: {
  dashboardState: SlowTradingDashboardState;
  onRefresh?: () => Promise<void>;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [history, setHistory] = useState(dashboardState.history ?? []);
  const [deletingAll, setDeletingAll] = useState(false);
  const [view, setView] = useState<TradeHistoryView>("all");
  const startingBalanceUSDT = dashboardState.balances.startingBalanceUSDT ?? 0;
  const activeMode = dashboardState.activeMode;
  const lossHistory = useMemo(
    () => history.filter(isLosingTrade),
    [history],
  );
  const profitHistory = useMemo(
    () => history.filter(isProfitableTrade),
    [history],
  );
  const visibleHistory =
    view === "losses"
      ? lossHistory
      : view === "profits"
        ? profitHistory
        : history;

  useEffect(() => {
    setHistory(dashboardState.history ?? []);
  }, [dashboardState.history]);

  const handleDeleteAll = async () => {
    if (history.length === 0) {
      enqueueSnackbar("No trade history to delete", { variant: "info" });
      return;
    }

    if (
      !confirm(
        `Delete all ${history.length} trade history rows from ${activeMode} mode?`,
      )
    ) {
      return;
    }

    setDeletingAll(true);
    try {
      const response = await axios.delete<{
        deletedCount?: number;
        state?: SlowTradingDashboardState;
      }>(endpoints.slow.prod.history, {
        data: {
          clearAll: true,
          mode: activeMode,
        },
      });

      setHistory(response.data.state?.history ?? []);
      enqueueSnackbar(
        `Deleted ${response.data.deletedCount ?? history.length} trade history row(s)`,
        { variant: "success" },
      );
      void onRefresh?.();
    } catch (error: any) {
      enqueueSnackbar(
        `Failed to delete trade history: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <Box sx={{ p: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 2,
        }}
      >
        <Tabs
          aria-label="Trade history views"
          value={view}
          onChange={(_, nextView: TradeHistoryView) => setView(nextView)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              minWidth: "auto",
              px: { xs: 1, sm: 2 },
            },
          }}
        >
          <Tab label="All view" value="all" />
          <Tab label="Loss evaluation" value="losses" />
          <Tab label="Profit evaluation" value="profits" />
        </Tabs>

        <Button
          size="small"
          color="error"
          variant="outlined"
          startIcon={<DeleteSweepIcon />}
          onClick={() => {
            void handleDeleteAll();
          }}
          disabled={deletingAll || history.length === 0}
        >
          {deletingAll ? "Deleting..." : "Delete All Trade History"}
        </Button>
      </Box>

      {view === "all" && (
        <>
          <Grid container spacing={1}>
            <Grid size={6}>
              <MaxUpDistributionChart
                history={history}
                takeProfitPct={
                  dashboardState.config.modelConfig.takeProfitPercent ?? 0
                }
              />
            </Grid>
          </Grid>
          <ChartsSection
            history={history}
            startingBalanceUSDT={startingBalanceUSDT}
          />
          <SummarySection
            history={history}
            startingBalanceUSDT={startingBalanceUSDT}
          />
        </>
      )}

      {view === "losses" && (
        <TradeOutcomeEvaluationSection history={lossHistory} outcome="loss" />
      )}

      {view === "profits" && (
        <TradeOutcomeEvaluationSection
          history={profitHistory}
          outcome="profit"
        />
      )}

      <TradesTableSection
        exchangeType={dashboardState.config.exchangeType}
        history={visibleHistory}
        mode={activeMode}
        onHistoryChange={(nextHistory, refreshDashboard) => {
          setHistory(nextHistory);
          if (refreshDashboard) {
            void onRefresh?.();
          }
        }}
        reserveMultiplier={dashboardState.config.watchReservePctAlloc ?? 2}
      />
    </Box>
  );
}
