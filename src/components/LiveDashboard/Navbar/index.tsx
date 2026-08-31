"use client";

import { Box, useTheme } from "@mui/material";

import {
  NavbarActionsSection,
  NavbarDayPreviewSection,
  NavbarIdentitySection,
} from "./NavbarSections";
import type { LiveDashboardNavbarProps } from "./types";
import { useLiveDashboardNavbar } from "./useLiveDashboardNavbar";
import {
  getNavbarBackgroundColor,
  useNavbarThemeColor,
} from "./theme-color";

export default function LiveDashboardNavbar({
  coinTags,
  dashboardState,
  onRefresh,
  onReinitialize,
  reinitializing,
  tagColors,
  tagDescriptions,
}: LiveDashboardNavbarProps) {
  const {
    configDraft,
    dayPreview,
    isActive,
    openPositionSummary,
    closeSettingsDialog,
    openSettingsDialog,
    resetSandbox,
    resettingSandboxAccount,
    runCycle,
    runningCycle,
    saveConfig,
    savingConfig,
    setConfigDraft,
    syncOnlineStorageToLocal,
    syncingOnlineStorage,
    tryWithdrawNow,
    tryingWithdraw,
  } = useLiveDashboardNavbar({
    dashboardState,
    onRefresh,
  });
  const theme = useTheme();
  const navbarBackgroundColor = getNavbarBackgroundColor(theme, isActive);
  const navbarForegroundColor = isActive
    ? theme.palette.getContrastText(navbarBackgroundColor)
    : theme.palette.text.primary;

  useNavbarThemeColor(
    navbarBackgroundColor,
    theme.palette.background.default,
  );

  return (
    <Box
      sx={{
        alignItems: { xs: "stretch", md: "center" },
        color: navbarForegroundColor,
        backgroundColor: navbarBackgroundColor,
        p: { xs: 0.75, md: 0.5 },
        boxShadow: 2,
        gap: { xs: 0.75, md: 1 },
        display: "grid",
        gridTemplateAreas: {
          xs: '"identity" "pnl" "actions"',
          md: '"identity pnl actions"',
        },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: "minmax(0, 1fr) auto minmax(0, 1fr)",
        },
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      <NavbarIdentitySection
        configDraft={configDraft}
        dashboardState={dashboardState}
      />

      <NavbarDayPreviewSection
        dashboardState={dashboardState}
        dayPreview={dayPreview}
        openPositionSummary={openPositionSummary}
      />

      <NavbarActionsSection
        coinTags={coinTags}
        configDraft={configDraft}
        dashboardState={dashboardState}
        onRefresh={onRefresh}
        onReinitialize={onReinitialize}
        reinitializing={reinitializing}
        onSettingsDialogClose={closeSettingsDialog}
        onSettingsDialogOpen={openSettingsDialog}
        resetSandbox={resetSandbox}
        resettingSandboxAccount={resettingSandboxAccount}
        runCycle={runCycle}
        runningCycle={runningCycle}
        saveConfig={saveConfig}
        savingConfig={savingConfig}
        setConfigDraft={setConfigDraft}
        syncOnlineStorageToLocal={syncOnlineStorageToLocal}
        syncingOnlineStorage={syncingOnlineStorage}
        tagColors={tagColors}
        tagDescriptions={tagDescriptions}
        tryWithdrawNow={tryWithdrawNow}
        tryingWithdraw={tryingWithdraw}
      />
    </Box>
  );
}
