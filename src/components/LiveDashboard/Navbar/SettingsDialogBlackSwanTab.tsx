"use client";

import BlackSwanSettings from "./BlackSwanSettings";
import type { ConfigDraft, ConfigDraftSetter, DashboardState } from "./types";

export default function SettingsDialogBlackSwanTab({
  configDraft,
  dashboardState,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
  setConfigDraft: ConfigDraftSetter;
}) {
  return (
    <BlackSwanSettings
      configDraft={configDraft}
      dashboardState={dashboardState}
      setConfigDraft={setConfigDraft}
    />
  );
}
