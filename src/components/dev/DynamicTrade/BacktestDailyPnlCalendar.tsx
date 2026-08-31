"use client";

import { useMemo } from "react";

import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";

import DailyPnlCalendarDialog, {
  buildTradePnlBalanceSnapshots,
} from "@/components/LiveDashboard/Shared/DailyPnlCalendarDialog";
import type { DynamicTradeBacktestReturn } from "@/components/api/dynamic";
import ButtonDialog from "@/components/ui/ButtonDialog";
import IconButtonTooltip from "@/components/ui/IconButtonTooltip";

export default function BacktestDailyPnlCalendar({
  data,
}: {
  data: DynamicTradeBacktestReturn | null;
}) {
  const balanceSnapshots = useMemo(
    () =>
      buildTradePnlBalanceSnapshots({
        history: data?.tradeHistory ?? [],
        startingBalanceUSDT: data?.startingBalanceUSDT ?? 0,
      }),
    [data?.startingBalanceUSDT, data?.tradeHistory],
  );
  const disabled = !data?.tradeHistory.length;

  return (
    <ButtonDialog
      title="Daily PnL Calendar"
      maxWidth={false}
      contentSx={{ p: { xs: 0, sm: 1 } }}
      sx={{ width: "100%", maxWidth: "100%" }}
      customButton={(handleOpen) => (
        <IconButtonTooltip
          color="info"
          disabled={disabled}
          onClick={handleOpen}
          tooltipTitle={
            disabled
              ? "Run a backtest with closed trades to open the daily PnL calendar"
              : "Open backtest daily PnL calendar"
          }
        >
          <CalendarMonthIcon />
        </IconButtonTooltip>
      )}
    >
      {() => (
        <DailyPnlCalendarDialog
          balanceSnapshots={balanceSnapshots}
          history={data?.tradeHistory ?? []}
          startingBalanceUSDT={data?.startingBalanceUSDT}
          description="Trade PnL and running balance are reconstructed from this backtest's closed trade results."
        />
      )}
    </ButtonDialog>
  );
}
