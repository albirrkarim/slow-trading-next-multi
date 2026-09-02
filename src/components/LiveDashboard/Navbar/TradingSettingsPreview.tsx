"use client";

import TradingLivePreview from "../Feature/TradingLivePreview";
import type { ConfigDraft, DashboardState } from "./types";

/** Builds the portfolio snapshot owned by the account being edited. */
function selectAccountPreviewState(
  dashboardState: DashboardState,
  accountSlug: string,
): DashboardState {
  const account = dashboardState.accountSummaries?.find(
    (candidate) => candidate.slug === accountSlug,
  );
  if (!account) {
    return dashboardState;
  }

  const history = dashboardState.history.filter(
    (position) => position.account === accountSlug,
  );
  const openPositions = dashboardState.openPositions.filter(
    (position) => position.account === accountSlug,
  );

  // PROD:TRADING_ACCOUNT_SCOPED_LIVE_PREVIEW
  return {
    ...dashboardState,
    accountFilter: account.slug,
    accountSummaries: [account],
    activeMode: account.activeMode,
    balances: account.balances,
    history,
    openPositions,
    runtime: {
      ...dashboardState.runtime,
      exchangeAccountSlug: account.slug,
    },
    stats: {
      ...dashboardState.stats,
      closedTrades: history.length,
      openPositions: openPositions.length,
    },
  };
}

export default function TradingSettingsPreview({
  configDraft,
  dashboardState,
}: {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
}) {
  const accountDashboardState = selectAccountPreviewState(
    dashboardState,
    configDraft.exchangeAccountSlug,
  );

  return (
    <TradingLivePreview
      allowSpendableAssumption
      config={configDraft}
      dashboardState={accountDashboardState}
      key={configDraft.exchangeAccountSlug}
      sticky
    />
  );
}
