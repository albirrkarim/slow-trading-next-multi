/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import SettingsDialog from "@/components/LiveDashboard/Navbar/SettingsDialog";
import SettingsDialogRuntimeTab from "@/components/LiveDashboard/Navbar/SettingsDialogRuntimeTab";
import { NavbarIdentitySection } from "@/components/LiveDashboard/Navbar/NavbarSections";
import { makeConfigDraft } from "@/components/LiveDashboard/Navbar/helpers";
import type {
  ConfigDraft,
  DashboardState,
} from "@/components/LiveDashboard/Navbar/types";
import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic";
import slowTradingAccountConfig from "@/lib/slowTrading/account-config";
import type { SlowTradingAccount } from "@/lib/slowTrading";
import blackSwan from "@/lib/trading/black-swan";

function createAccount(params: {
  enabled?: boolean;
  initialBalanceUSDT: number;
  maxOpenPositions: number;
  name: string;
  sandboxEnabled: boolean;
  slug: string;
}): SlowTradingAccount {
  const now = Date.now();
  const trading = slowTradingAccountConfig.trading.fromEffectiveConfig({
    ...DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
    maxOpenPositions: params.maxOpenPositions,
  });

  return {
    slug: params.slug,
    type: "binance",
    name: params.name,
    description: "",
    credentials: { apiKey: "", apiSecret: "" },
    enabled: params.enabled !== false,
    trading,
    sandbox: {
      enabled: params.sandboxEnabled,
      initialBalanceUSDT: params.initialBalanceUSDT,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createState(): DashboardState {
  const accounts = [
    createAccount({
      slug: "alpha",
      name: "Alpha",
      maxOpenPositions: 2,
      sandboxEnabled: true,
      initialBalanceUSDT: 1_000,
    }),
    createAccount({
      slug: "beta",
      name: "Beta",
      maxOpenPositions: 7,
      sandboxEnabled: true,
      initialBalanceUSDT: 2_000,
    }),
    createAccount({
      slug: "paused",
      name: "Paused",
      enabled: false,
      maxOpenPositions: 1,
      sandboxEnabled: false,
      initialBalanceUSDT: 500,
    }),
  ];

  return {
    accountFilter: null,
    accountSummaries: [
      {
        slug: "alpha",
        name: "Alpha",
        enabled: true,
        activeMode: "live",
        balances: {
          availableQuoteAsset: 111,
          reservedQuoteAsset: 1,
          spendableQuoteAsset: 110,
          safeHaven: 0,
          lockedQuoteAsset: 11,
          startingBalanceUSDT: 100,
        },
      },
      {
        slug: "beta",
        name: "Beta",
        enabled: true,
        activeMode: "sandbox",
        balances: {
          availableQuoteAsset: 222,
          reservedQuoteAsset: 2,
          spendableQuoteAsset: 220,
          safeHaven: 0,
          lockedQuoteAsset: 22,
          startingBalanceUSDT: 200,
        },
      },
      {
        slug: "paused",
        name: "Paused",
        enabled: false,
        activeMode: "live",
        balances: {
          availableQuoteAsset: 333,
          reservedQuoteAsset: 0,
          spendableQuoteAsset: 333,
          safeHaven: 0,
          lockedQuoteAsset: 0,
          startingBalanceUSDT: 300,
        },
      },
    ],
    activeMode: "live",
    globalConfig: { volatilityThresholdPct: 2 },
    config: {
      ...DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
      ...slowTradingAccountConfig.trading.toEffectiveConfig(
        DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
        accounts[0],
      ),
    },
    runtime: {
      exchangeAccountSlug: "alpha",
      exchangeAccounts: accounts,
      runnerEnabled: false,
      autoEntryEnabled: false,
      autoEntryDailyPnlLimitUSDT: -50,
      autoExitEnabled: false,
      entrySignalBypass: false,
      autoRemoveSymbolAbsLevel: 0,
      autoRemoveSymbolMinPrice: 0,
      autoRemoveSymbolMinMarketCapUSD: 0,
      autoRemoveSymbolMinVPointPct: 15,
      pnlHistoryBucketMinutes: 60,
      blackSwanStageIntervalMinutes: 1,
      speedupStageIntervalMinutes: 1,
      speedupStagePositivePnlThresholdPct: 1.5,
      speedupStageNegativePnlThresholdPct: 1.5,
      speedupStageTakeProfitOffsetPct: 0.5,
      standardMonitoringStageIntervalMinutes: 5,
      managementStageIntervalMinutes: 5,
      captureEntryStageIntervalMinutes: 5,
      notification: {
        email: { enabled: false, types: [] },
        telegram: { enabled: false, types: [] },
      },
      sandboxEnabled: true,
      sandboxInitialBalanceUSDT: 1_000,
      withdrawal: { autoEnabled: false, schedules: [], walletBook: [] },
      safeHaven: { autoEnabled: false, schedules: [] },
      mcp: { tokens: [] },
    },
    blackSwan: blackSwan.state.create(),
    balances: {
      availableQuoteAsset: 333,
      reservedQuoteAsset: 3,
      spendableQuoteAsset: 330,
      safeHaven: 0,
      lockedQuoteAsset: 33,
      startingBalanceUSDT: 300,
    },
    history: [],
    openPositions: [],
    stats: {
      closedTrades: 0,
      openPositions: 0,
      stageRuns: {},
    },
  } as DashboardState;
}

function createDraft(): ConfigDraft {
  return makeConfigDraft(createState());
}

describe("multi-account settings UI", () => {
  it("switches the Trading editor without losing the previous account's draft", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [draft, setDraft] = useState<ConfigDraft | null>(createDraft());
      if (!draft) return null;

      return (
        <SettingsDialog
          configDraft={draft}
          dashboardState={createState()}
          onCloseDialog={vi.fn()}
          onOpenDialog={vi.fn()}
          onReinitialize={vi.fn(async () => undefined)}
          reinitializing={false}
          resetSandbox={vi.fn(async () => undefined)}
          resettingSandboxAccount={null}
          saveConfig={vi.fn(async () => undefined)}
          savingConfig={false}
          setConfigDraft={setDraft}
          syncOnlineStorageToLocal={vi.fn(async () => undefined)}
          syncingOnlineStorage={false}
          tryWithdrawNow={vi.fn(async () => undefined)}
          tryingWithdraw={false}
        />
      );
    }

    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Open dashboard settings" }),
    );

    const maxPositions = screen.getByLabelText(
      "Max Open Positions",
    ) as HTMLInputElement;
    expect(maxPositions.value).toBe("2");
    fireEvent.change(maxPositions, { target: { value: "5" } });

    await user.click(
      screen.getByRole("combobox", { name: "Editing Account" }),
    );
    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(
      (screen.getByLabelText("Max Open Positions") as HTMLInputElement).value,
    ).toBe("7");

    await user.click(
      screen.getByRole("combobox", { name: "Editing Account" }),
    );
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(
      (screen.getByLabelText("Max Open Positions") as HTMLInputElement).value,
    ).toBe("5");

  });

  it("renders and updates one Sandbox section per account", async () => {
    const resetSandbox = vi.fn(async (_accountSlug: string) => undefined);

    function Harness() {
      const [draft, setDraft] = useState<ConfigDraft | null>(createDraft());
      if (!draft) return null;

      return (
        <SettingsDialogRuntimeTab
          configDraft={draft}
          onReinitialize={vi.fn(async () => undefined)}
          reinitializing={false}
          resetSandbox={resetSandbox}
          resettingSandboxAccount={null}
          setConfigDraft={setDraft}
          syncOnlineStorageToLocal={vi.fn(async () => undefined)}
          syncingOnlineStorage={false}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();

    const alphaBalance = screen.getByLabelText(
      "Alpha Sandbox Initial Balance (USDT)",
    ) as HTMLInputElement;
    const betaBalance = screen.getByLabelText(
      "Beta Sandbox Initial Balance (USDT)",
    ) as HTMLInputElement;
    expect(alphaBalance.value).toBe("1000");
    expect(betaBalance.value).toBe("2000");

    fireEvent.change(betaBalance, { target: { value: "2500" } });
    expect(alphaBalance.value).toBe("1000");
    expect(betaBalance.value).toBe("2500");

    await userEvent.click(
      screen.getByRole("button", { name: "Reset Beta Sandbox" }),
    );
    expect(resetSandbox).toHaveBeenCalledWith("beta");
  });

  it("shows one account chip and balance group for every enabled account", () => {
    window.localStorage.setItem(
      "slow-trading:navbar:balance-visible:v1",
      "true",
    );
    const state = createState();

    render(
      <NavbarIdentitySection
        configDraft={makeConfigDraft(state)}
        dashboardState={state}
      />,
    );

    expect(screen.getByText("Alpha · LIVE")).toBeTruthy();
    expect(screen.getByText("Beta · SANDBOX")).toBeTruthy();
    expect(screen.queryByText("Paused · LIVE")).toBeNull();

    expect(
      within(
        screen.getByRole("group", { name: "Alpha balance" }),
      ).getByText("$122"),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("group", { name: "Beta balance" }),
      ).getByText("$244"),
    ).toBeTruthy();
  });
});
