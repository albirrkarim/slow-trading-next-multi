import { describe, expect, it } from "vitest";

import {
  parseConfigBackup,
  stringifyConfigBackup,
} from "@/components/LiveDashboard/Navbar/SettingsDialogBackupTab";
import type { ConfigDraft } from "@/components/LiveDashboard/Navbar/types";

const configDraft = {
  adaptiveAveraging: {
    enabled: true,
    maxMultiplier: 5,
    minProjectedProfitPct: 2,
  },
  autoEntryEnabled: true,
  autoEntryDailyPnlLimitUSDT: -50,
  autoExitEnabled: true,
  autoRemoveSymbolAbsLevel: 6,
  autoRemoveSymbolMinMarketCapUSD: 100_000_000,
  autoRemoveSymbolMinPrice: 0.01,
  autoRemoveSymbolMinVPointPct: 15,
  decisionEngineVersion: "decision.v19",
  description: "Backup test",
  enableWatchLogic: true,
  entrySignalBypass: false,
  exactLeverage: 3,
  exchangeAccountId: "account-1",
  exchangeAccounts: [
    {
      id: "account-1",
      credentials: {
        apiKey: "secret-key",
        apiSecret: "secret-value",
      },
    },
  ],
  exchangeType: "binance",
  exitSidewaysToFreeWorkersForStrongCandidates: true,
  maxEntryBased24HourVolPct: 0.2,
  maxEntryMargin: 10,
  maxEntryMarginPct: 0,
  maxLeverage: 3,
  minActionableAbsoluteLevel: 2,
  modelConfig: {
    stopLossPercent: 15,
    takeProfitPercent: 2,
  },
  name: "Seasonal Trade",
  pnlHistoryBucketMinutes: 15,
  speedupStageIntervalMinutes: 1,
  speedupStagePositivePnlThresholdPct: 1.5,
  speedupStageNegativePnlThresholdPct: 1.5,
  speedupStageTakeProfitOffsetPct: 0.5,
  standardMonitoringStageIntervalMinutes: 5,
  managementStageIntervalMinutes: 5,
  captureEntryStageIntervalMinutes: 5,
  notification: {
    email: { enabled: false, types: [] },
    telegram: {
      enabled: true,
      types: [
        {
          id: "NOTIF_HIGH_VOLATILITY",
          params: { level: 4 },
        },
        {
          id: "NOTIF_STALE_POSITION",
          params: { hour: 1 },
        },
      ],
    },
  },
  runnerEnabled: true,
  safeHavenUSDT: "10",
  sandboxEnabled: true,
  sandboxInitialBalanceUSDT: "2000",
  symbolsText: "AAVE, ARB",
  tradingMode: "futures",
  watchMaxNextAveragingLevels: 4,
  watchReserveLevels: 2,
  watchReservePctAlloc: 2,
  withdrawalAutoEnabled: false,
  withdrawalSchedules: [],
  withdrawalWalletBook: [],
} as unknown as ConfigDraft;

describe("settings config backup", () => {
  it("round-trips the complete settings draft, including credentials", () => {
    const backup = stringifyConfigBackup(configDraft);

    expect(parseConfigBackup(backup)).toEqual(configDraft);
    expect(backup).toContain("secret-value");
  });

  it("rejects invalid or incomplete backups", () => {
    expect(() => parseConfigBackup("not json")).toThrow(
      "The pasted value is not valid JSON.",
    );
    expect(() => parseConfigBackup('{"name":"incomplete"}')).toThrow(
      'The backup is missing the required "description" field.',
    );
  });

  it("defaults the daily PnL stop when importing an older backup", () => {
    const {
      autoEntryDailyPnlLimitUSDT: _legacyMissingField,
      ...legacyBackup
    } = configDraft;

    expect(
      parseConfigBackup(JSON.stringify(legacyBackup))
        .autoEntryDailyPnlLimitUSDT,
    ).toBe(-50);
  });
});
