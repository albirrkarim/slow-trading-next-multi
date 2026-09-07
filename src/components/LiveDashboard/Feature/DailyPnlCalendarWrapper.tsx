import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Box, CircularProgress, Typography } from "@mui/material";

import DailyPnlCalendarDialog, {
  toDailyPnlCalendarTrade,
  type DailyPnlCalendarBalanceSnapshot,
} from "@/components/LiveDashboard/Shared/DailyPnlCalendarDialog";
import { endpoints } from "@/components/endpoints";
import type {
  SlowTradingDashboardAccountSummary,
  SlowTradingHistoryPosition,
  SlowTradingMode,
} from "@/lib/slowTrading";

export interface DailyPnlCalendarWrapperProps {
  accountSummaries: SlowTradingDashboardAccountSummary[];
  activeMode: SlowTradingMode;
  history: SlowTradingHistoryPosition[];
}

/** Selects the enabled-account history and summed starting balance. */
export function selectEnabledAccountCalendarInputs(params: {
  accountSummaries: SlowTradingDashboardAccountSummary[];
  history: SlowTradingHistoryPosition[];
}) {
  // PROD:MULTI_ACCOUNT_DAILY_BALANCE_SNAPSHOTS
  const enabledAccountSlugs = new Set(
    params.accountSummaries
      .filter((account) => account.enabled)
      .map((account) => account.slug),
  );

  return {
    history: params.history.filter((position) =>
      enabledAccountSlugs.has(position.account),
    ),
    startingBalanceUSDT: params.accountSummaries
      .filter((account) => account.enabled)
      .reduce(
        (total, account) => total + account.balances.startingBalanceUSDT,
        0,
      ),
  };
}

export default function DailyPnlCalendarWrapper({
  accountSummaries,
  activeMode,
  history,
}: DailyPnlCalendarWrapperProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceSnapshots, setBalanceSnapshots] = useState<
    DailyPnlCalendarBalanceSnapshot[] | null
  >(null);
  const enabledInputs = useMemo(
    () => selectEnabledAccountCalendarInputs({ accountSummaries, history }),
    [accountSummaries, history],
  );
  const calendarHistory = useMemo(
    () => enabledInputs.history.map(toDailyPnlCalendarTrade),
    [enabledInputs.history],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const snapshotsRes = await axios.get<DailyPnlCalendarBalanceSnapshot[]>(
          endpoints.slow.prod.balanceSnapshots,
          { params: { mode: activeMode } },
        );

        if (mounted) {
          setBalanceSnapshots(snapshotsRes.data);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message ?? "Failed to load data");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [activeMode]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error || !balanceSnapshots) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">
          {error ?? "Failed to load calendar data"}
        </Typography>
      </Box>
    );
  }

  return (
    <DailyPnlCalendarDialog
      history={calendarHistory}
      balanceSnapshots={balanceSnapshots}
      startingBalanceUSDT={enabledInputs.startingBalanceUSDT}
    />
  );
}
