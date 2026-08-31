"use client";

import TradingLivePreview from "../Feature/TradingLivePreview";
import type { ConfigDraft, DashboardState } from "./types";

export default function TradingSettingsPreview({
  configDraft,
  dashboardState,
}: {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
}) {
  return (
    <TradingLivePreview
      allowSpendableAssumption
      config={configDraft}
      dashboardState={dashboardState}
      sticky
    />
  );
}
