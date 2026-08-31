import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Box, CircularProgress, Typography } from "@mui/material";

import DailyPnlCalendarDialog, {
  toDailyPnlCalendarTrade,
  type DailyPnlCalendarBalanceSnapshot,
} from "@/components/LiveDashboard/Shared/DailyPnlCalendarDialog";
import { endpoints } from "@/components/endpoints";
import type {
  SlowTradingHistoryPosition,
  SlowTradingMode,
} from "@/lib/slowTrading";

export interface DailyPnlCalendarWrapperProps {
  activeMode: SlowTradingMode;
  history: SlowTradingHistoryPosition[];
  startingBalanceUSDT: number;
}

export default function DailyPnlCalendarWrapper({
  activeMode,
  history,
  startingBalanceUSDT,
}: DailyPnlCalendarWrapperProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceSnapshots, setBalanceSnapshots] = useState<
    DailyPnlCalendarBalanceSnapshot[] | null
  >(null);
  const calendarHistory = useMemo(
    () => history.map(toDailyPnlCalendarTrade),
    [history],
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
      startingBalanceUSDT={startingBalanceUSDT}
    />
  );
}
