"use client";

import { useState } from "react";

import ButtonDialog from "@/components/ui/ButtonDialog";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import BackupIcon from "@mui/icons-material/Backup";
import HubIcon from "@mui/icons-material/Hub";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import { Box, Button, IconButton, Tab, Tabs } from "@mui/material";
import SettingsDialogRuntimeTab from "./SettingsDialogRuntimeTab";
import SettingsDialogBackupTab from "./SettingsDialogBackupTab";
import SettingsDialogBlackSwanTab from "./SettingsDialogBlackSwanTab";
import SettingsDialogManagementTab from "./SettingsDialogManagementTab";
import SettingsDialogMcpTab from "./SettingsDialogMcpTab";
import SettingsDialogNotificationTab from "./SettingsDialogNotificationTab";
import SettingsDialogTradingTab from "./SettingsDialogTradingTab";
import SettingsDialogWithdrawTab from "./SettingsDialogWithdrawTab";
import type { ConfigDraft, ConfigDraftSetter, DashboardState } from "./types";

export const SETTINGS_TABS = [
  { label: "Trading", value: "trading" },
  { label: "Management", value: "management" },
  { label: "Black Swan", value: "black-swan" },
  { label: "Runtime", value: "runtime" },
  { label: "Backup", value: "backup" },
  { label: "Notification", value: "notification" },
  { label: "Withdraw", value: "withdraw" },
  { label: "MCP", value: "mcp" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "trading";

function SettingsTabIcon({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "trading":
      return <AutoGraphIcon fontSize="small" />;
    case "management":
      return <ManageAccountsIcon fontSize="small" />;
    case "black-swan":
      return <ShieldOutlinedIcon fontSize="small" />;
    case "runtime":
      return <TuneIcon fontSize="small" />;
    case "backup":
      return <BackupIcon fontSize="small" />;
    case "notification":
      return <NotificationsActiveIcon fontSize="small" />;
    case "withdraw":
      return <AccountBalanceWalletIcon fontSize="small" />;
    case "mcp":
      return <HubIcon fontSize="small" />;
    default:
      return null;
  }
}

export default function SettingsDialog(props: {
  configDraft: ConfigDraft;
  dashboardState: DashboardState;
  onCloseDialog: () => void;
  onOpenDialog: () => void;
  onReinitialize: () => Promise<void>;
  reinitializing: boolean;
  resetSandbox: () => Promise<void>;
  resettingSandbox: boolean;
  saveConfig: (handleClose?: () => void) => Promise<void>;
  savingConfig: boolean;
  setConfigDraft: ConfigDraftSetter;
  syncOnlineStorageToLocal: (onlineBaseUrl: string) => Promise<void>;
  syncingOnlineStorage: boolean;
  tryWithdrawNow: (scheduleId: string) => Promise<void>;
  tryingWithdraw: boolean;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(DEFAULT_SETTINGS_TAB);
  const {
    configDraft,
    dashboardState,
    onCloseDialog,
    onOpenDialog,
    onReinitialize,
    reinitializing,
    resetSandbox,
    resettingSandbox,
    saveConfig,
    savingConfig,
    setConfigDraft,
    syncOnlineStorageToLocal,
    syncingOnlineStorage,
    tryWithdrawNow,
    tryingWithdraw,
  } = props;

  return (
    <ButtonDialog
      title="Settings"
      titleLong="Dashboard Settings"
      maxWidth="xl"
      customButton={(handleOpen) => (
        <IconButton
          onClick={() => {
            onOpenDialog();
            handleOpen();
          }}
          title="Open dashboard settings"
          color="inherit"
        >
          <SettingsIcon />
        </IconButton>
      )}
      beforeClose={onCloseDialog}
    >
      {(handleClose) => (
        <Box sx={{ p: 1 }}>
          <Tabs
            value={activeTab}
            onChange={(_, value: SettingsTab) => {
              setActiveTab(value);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mb: 1.5,
              minHeight: 34,
              "& .MuiTabs-indicator": {
                height: 2,
              },
              "& .MuiTab-root": {
                fontSize: "0.74rem",
                fontWeight: 700,
                minHeight: 34,
                minWidth: 0,
                px: 1.25,
                py: 0.5,
              },
              "& .MuiTab-iconWrapper": {
                fontSize: "1rem",
                mr: 0.75,
              },
            }}
          >
            {SETTINGS_TABS.map((tab) => (
              <Tab
                icon={<SettingsTabIcon tab={tab.value} />}
                iconPosition="start"
                key={tab.value}
                label={tab.label}
                value={tab.value}
              />
            ))}
          </Tabs>

          <Box sx={{ minHeight: 420 }}>
            {activeTab === "runtime" ? (
              <SettingsDialogRuntimeTab
                configDraft={configDraft}
                onReinitialize={onReinitialize}
                reinitializing={reinitializing}
                resetSandbox={resetSandbox}
                resettingSandbox={resettingSandbox}
                setConfigDraft={setConfigDraft}
                syncOnlineStorageToLocal={syncOnlineStorageToLocal}
                syncingOnlineStorage={syncingOnlineStorage}
              />
            ) : null}

            {activeTab === "trading" ? (
              <SettingsDialogTradingTab
                configDraft={configDraft}
                dashboardState={dashboardState}
                setConfigDraft={setConfigDraft}
              />
            ) : null}

            {activeTab === "management" ? (
              <SettingsDialogManagementTab
                configDraft={configDraft}
                setConfigDraft={setConfigDraft}
              />
            ) : null}

            {activeTab === "black-swan" ? (
              <SettingsDialogBlackSwanTab
                configDraft={configDraft}
                dashboardState={dashboardState}
                setConfigDraft={setConfigDraft}
              />
            ) : null}

            {activeTab === "backup" ? (
              <SettingsDialogBackupTab
                configDraft={configDraft}
                setConfigDraft={setConfigDraft}
              />
            ) : null}

            {activeTab === "notification" ? (
              <SettingsDialogNotificationTab
                configDraft={configDraft}
                setConfigDraft={setConfigDraft}
              />
            ) : null}

            {activeTab === "withdraw" ? (
              <SettingsDialogWithdrawTab
                configDraft={configDraft}
                setConfigDraft={setConfigDraft}
                tryWithdrawNow={tryWithdrawNow}
                tryingWithdraw={tryingWithdraw}
              />
            ) : null}

            {activeTab === "mcp" && <SettingsDialogMcpTab />}
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              mt: 2,
            }}
          >
            <Button onClick={handleClose}>Close</Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => {
                void saveConfig(handleClose);
              }}
              disabled={savingConfig}
            >
              {savingConfig ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      )}
    </ButtonDialog>
  );
}
