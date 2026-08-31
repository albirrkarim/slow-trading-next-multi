"use client";

import { useMemo, useState } from "react";

import { Box, MenuItem, TextField, Typography } from "@mui/material";

import { TradesTableSection } from "@/components/LiveDashboard/Reporting/TradesTableSection";
import type { ExchangeType } from "@/lib/exchange";
import type {
  SlowQuickBacktestResult,
  SlowTradingAccount,
} from "@/lib/slowTrading";

const COMBINED_ACCOUNT_VALUE = "";

interface QuickBacktestTradeHistoryProps {
  accounts: Pick<SlowTradingAccount, "name" | "slug">[];
  exchangeType: ExchangeType;
  history: SlowQuickBacktestResult["tradeHistory"];
}

/** Filters Quick Backtest history to one account while preserving combined order. */
export function filterQuickBacktestTradeHistory(
  history: SlowQuickBacktestResult["tradeHistory"],
  accountSlug: string,
): SlowQuickBacktestResult["tradeHistory"] {
  if (!accountSlug) {
    return history;
  }

  return history.filter((trade) => trade.account === accountSlug);
}

export default function QuickBacktestTradeHistory({
  accounts,
  exchangeType,
  history,
}: QuickBacktestTradeHistoryProps) {
  const [accountSlug, setAccountSlug] = useState(COMBINED_ACCOUNT_VALUE);
  const effectiveAccountSlug = accounts.some(
    (account) => account.slug === accountSlug,
  )
    ? accountSlug
    : COMBINED_ACCOUNT_VALUE;
  const visibleHistory = useMemo(
    () => filterQuickBacktestTradeHistory(history, effectiveAccountSlug),
    [effectiveAccountSlug, history],
  );
  const tradeCountByAccount = useMemo(() => {
    const counts = new Map<string, number>();

    for (const trade of history) {
      counts.set(trade.account, (counts.get(trade.account) ?? 0) + 1);
    }

    return counts;
  }, [history]);

  return (
    <Box sx={{ p: 1 }}>
      <Box
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1,
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <TextField
          label="Account view"
          onChange={(event) => setAccountSlug(event.target.value)}
          select
          size="small"
          sx={{ minWidth: { xs: "100%", sm: 240 } }}
          value={effectiveAccountSlug}
        >
          <MenuItem value={COMBINED_ACCOUNT_VALUE}>
            Combined ({history.length})
          </MenuItem>
          {accounts.map((account) => (
            <MenuItem key={account.slug} value={account.slug}>
              {`${account.name || account.slug} (${tradeCountByAccount.get(account.slug) ?? 0})`}
            </MenuItem>
          ))}
        </TextField>

        <Typography color="text.secondary" variant="body2">
          Showing {visibleHistory.length} of {history.length} trades
        </Typography>
      </Box>

      <TradesTableSection
        exchangeType={exchangeType}
        history={visibleHistory}
        mode="sandbox"
        onHistoryChange={() => undefined}
        readOnly
      />
    </Box>
  );
}
