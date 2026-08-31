/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import SettingsDialogTradingTab from "@/components/LiveDashboard/Navbar/SettingsDialogTradingTab";
import type {
  ConfigDraft,
  DashboardState,
} from "@/components/LiveDashboard/Navbar/types";
import { TradingMode } from "@/lib/exchange";

const configDraft = {
  adaptiveAveraging: {
    enabled: true,
    maxMultiplier: 5,
    minProjectedProfitPct: 2,
  },
  averagingRescueProjectionGuardEnabled: true,
  autoEntryEnabled: true,
  autoExitEnabled: true,
  autoRemoveSymbolAbsLevel: 0,
  decisionEngineVersion: "decision.v19",
  description: "",
  enableWatchLogic: false,
  entrySignalBypass: false,
  exchangeAccountSlug: "1",
  exchangeAccounts: [],
  exchangeType: "binance",
  maxEntryBased24HourVolPct: 0.2,
  maxOpenPositions: 0,
  minActionableAbsoluteLevel: 2,
  modelConfig: {
    exitOnVPointAbsLevel: 0,
    stopLossPercent: 15,
    stopLossPlusTrigger: 1,
    stopLossUSDT: 50,
    takeProfitPercent: 2,
    useStopLossPlus: false,
  },
  name: "Trading tab test",
  notification: {
    email: { enabled: false, types: [] },
    telegram: { enabled: false, types: [] },
  },
  runnerEnabled: true,
  safeHavenUSDT: "0",
  sandboxEnabled: true,
  sandboxInitialBalanceUSDT: "1,000",
  symbolsText: "SUI",
  tradingMode: TradingMode.FUTURES,
  watchMaxNextAveragingLevels: 2,
  watchReserveLevels: 1,
  watchReservePctAlloc: 2,
  withdrawalAutoEnabled: false,
  withdrawalSchedules: [],
  withdrawalWalletBook: [],
} satisfies ConfigDraft;

const dashboardState = {
  balances: {
    spendableQuoteAsset: 180,
  },
  openPositions: [],
} as unknown as DashboardState;

describe("SettingsDialogTradingTab", () => {
  it("edits the maximum-open-position guard as a non-negative integer", () => {
    let nextConfigDraft: ConfigDraft | null = configDraft;
    const setConfigDraft = vi.fn(
      (update: SetStateAction<ConfigDraft | null>) => {
        nextConfigDraft =
          typeof update === "function" ? update(nextConfigDraft) : update;
      },
    );
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    const input = screen.getByLabelText(
      "Max Open Positions",
    ) as HTMLInputElement;
    expect(input.min).toBe("0");

    fireEvent.change(input, { target: { value: "4.8" } });
    expect(nextConfigDraft?.maxOpenPositions).toBe(4);

    fireEvent.change(input, { target: { value: "-2" } });
    expect(nextConfigDraft?.maxOpenPositions).toBe(0);
  });

  it("allows Min Actionable Absolute Level 1", () => {
    let nextConfigDraft: ConfigDraft | null = configDraft;
    const setConfigDraft = vi.fn(
      (update: SetStateAction<ConfigDraft | null>) => {
        nextConfigDraft =
          typeof update === "function" ? update(nextConfigDraft) : update;
      },
    );
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    const input = screen.getByLabelText(
      "Min Actionable Absolute Level",
    ) as HTMLInputElement;
    expect(input.min).toBe("1");

    fireEvent.change(input, { target: { value: "1" } });
    expect(nextConfigDraft?.minActionableAbsoluteLevel).toBe(1);

    fireEvent.change(input, { target: { value: "0" } });
    expect(nextConfigDraft?.minActionableAbsoluteLevel).toBe(1);
  });

  it("uses Averaging as the master switch for its dependent controls", () => {
    const setConfigDraft = vi.fn();
    const { rerender } = render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    expect(screen.queryByText("Enable Watch Logic Algorithm")).toBeNull();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Averaging",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);

    for (const label of [
      "Adaptive Max Multiplier",
      "Adaptive Minimum Projected Profit %",
      "Reserve Next Levels",
      "Reserve Multiplier",
      "Max Next Averaging Levels",
    ]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(
        true,
      );
    }
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Adaptive Averaging",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Averaging Rescue Projection Guard",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Averaging" }));
    const updateConfig = setConfigDraft.mock.calls[0][0];
    expect(updateConfig(configDraft)).toMatchObject({
      enableWatchLogic: true,
    });

    rerender(
      <SettingsDialogTradingTab
        configDraft={{ ...configDraft, enableWatchLogic: true }}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    expect(
      (screen.getByLabelText("Reserve Next Levels") as HTMLInputElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByLabelText("Adaptive Max Multiplier") as HTMLInputElement)
        .disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Adaptive Averaging",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Averaging Rescue Projection Guard",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
  });

  it("updates adaptive averaging settings as one grouped config", () => {
    let nextConfigDraft: ConfigDraft | null = {
      ...configDraft,
      enableWatchLogic: true,
    };
    const setConfigDraft = vi.fn(
      (update: SetStateAction<ConfigDraft | null>) => {
        nextConfigDraft =
          typeof update === "function" ? update(nextConfigDraft) : update;
      },
    );
    render(
      <SettingsDialogTradingTab
        configDraft={nextConfigDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    fireEvent.change(screen.getByLabelText("Adaptive Max Multiplier"), {
      target: { value: "7" },
    });
    fireEvent.change(
      screen.getByLabelText("Adaptive Minimum Projected Profit %"),
      { target: { value: "1.4" } },
    );

    expect(nextConfigDraft?.adaptiveAveraging).toEqual({
      enabled: true,
      maxMultiplier: 7,
      minProjectedProfitPct: 1.4,
    });
  });

  it("updates the averaging rescue-projection guard independently", () => {
    const setConfigDraft = vi.fn();
    render(
      <SettingsDialogTradingTab
        configDraft={{ ...configDraft, enableWatchLogic: true }}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Averaging Rescue Projection Guard",
      }),
    );
    const updateConfig = setConfigDraft.mock.calls[0][0];

    expect(updateConfig(configDraft)).toMatchObject({
      averagingRescueProjectionGuardEnabled: false,
    });
  });

  it("edits the StopLoss+ retrace only while StopLoss+ is enabled", () => {
    const setConfigDraft = vi.fn();
    const { rerender } = render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    expect(
      (screen.getByLabelText("StopLoss+ Retrace Trigger %") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByLabelText("StopLoss+ Activation %")).toBeNull();

    fireEvent.click(
      screen
        .getByText("8. StopLoss+ trailing exit")
        .closest("button") as HTMLButtonElement,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Use StopLoss+" }));
    const enableStopLossPlus = setConfigDraft.mock.calls[0][0];
    expect(enableStopLossPlus(configDraft).modelConfig).toMatchObject({
      useStopLossPlus: true,
    });

    rerender(
      <SettingsDialogTradingTab
        configDraft={{
          ...configDraft,
          modelConfig: {
            ...configDraft.modelConfig,
            useStopLossPlus: true,
          },
        }}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    expect(
      (screen.getByLabelText("StopLoss+ Retrace Trigger %") as HTMLInputElement)
        .value,
    ).toBe("1");

    fireEvent.change(screen.getByLabelText("StopLoss+ Retrace Trigger %"), {
      target: { value: "1.5" },
    });
    const updateTrigger = setConfigDraft.mock.calls.at(-1)?.[0];
    expect(updateTrigger(configDraft).modelConfig).toMatchObject({
      stopLossPlusTrigger: 1.5,
    });
  });

  it("updates the production vPoint and net USDT exit limits", () => {
    const setConfigDraft = vi.fn();
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    expect(
      (screen.getByLabelText(
        "Exit On Absolute vPoint Level",
      ) as HTMLInputElement).value,
    ).toBe("0");
    expect(
      (screen.getByLabelText(
        "Stop Loss By Net USDT Loss",
      ) as HTMLInputElement).value,
    ).toBe("50");

    fireEvent.change(screen.getByLabelText("Exit On Absolute vPoint Level"), {
      target: { value: "6" },
    });
    const updateVPointLevel = setConfigDraft.mock.calls.at(-1)?.[0];
    expect(updateVPointLevel(configDraft).modelConfig).toMatchObject({
      exitOnVPointAbsLevel: 6,
    });

    fireEvent.change(screen.getByLabelText("Stop Loss By Net USDT Loss"), {
      target: { value: "75" },
    });
    const updateUsdtLoss = setConfigDraft.mock.calls.at(-1)?.[0];
    expect(updateUsdtLoss(configDraft).modelConfig).toMatchObject({
      stopLossUSDT: 75,
    });
  });

  it("shows the ordered exit strategies and their test contracts", () => {
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("Automatic Exit Order")).toBeDefined();
    expect(screen.getByText("1. Queued sideways worker release")).toBeDefined();
    expect(
      screen.getByText("2. Exit on absolute vPoint level"),
    ).toBeDefined();
    expect(screen.getByText("3. Stop loss by net USDT loss")).toBeDefined();
    expect(screen.getByText("4. Hard stop loss")).toBeDefined();
    expect(
      screen.getByText("5. Volatility target-zone stop loss"),
    ).toBeDefined();
    expect(screen.getByText("6. Post-average rescue exit")).toBeDefined();
    expect(screen.getByText("7. Post-average stop loss")).toBeDefined();
    expect(screen.getByText("8. StopLoss+ trailing exit")).toBeDefined();
    expect(screen.getByText("9. Volatility target-zone TP")).toBeDefined();
    expect(screen.getByText("10. Traditional TP fallback")).toBeDefined();

    for (const tc of [
      "TC: BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES",
      "TC: PROD:EXIT_ON_VPOINT_LEVEL",
      "TC: BOTH:STOP_LOSS_BY_USDT_LOSS",
      "TC: BOTH:POST_AVERAGE_RESCUE_EXIT",
      "TC: BOTH:POST_AVERAGE_STOP_LOSS",
      "TC: PROD:SL_PLUS",
      "TC: BOTH:VOLATILITY_TARGET_TP",
    ]) {
      expect(screen.getByText(tc)).toBeDefined();
    }
    expect(screen.getAllByText("TC: BOTH:TRADITIONAL_TP_SL")).toHaveLength(2);

    const postAverageSummary = screen
      .getByText("6. Post-average rescue exit")
      .closest("button");
    expect(postAverageSummary?.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(postAverageSummary as HTMLButtonElement);
    expect(postAverageSummary?.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("checkbox", {
        name: "Enable post-average rescue exit",
      }),
    ).toBeDefined();
    expect(screen.getAllByLabelText("Minimum Averaging Count")).toHaveLength(4);
    expect(screen.getAllByLabelText("Minimum Net PnL (%)")).toHaveLength(3);
  });

  it("updates post-average rescue exit thresholds", () => {
    const setConfigDraft = vi.fn();
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    fireEvent.click(
      screen
        .getByText("6. Post-average rescue exit")
        .closest("button") as HTMLButtonElement,
    );
    fireEvent.change(screen.getAllByLabelText("Minimum Net PnL (%)")[0], {
      target: { value: "1.25" },
    });

    const updateConfig = setConfigDraft.mock.calls.at(-1)?.[0];
    expect(
      updateConfig(configDraft).modelConfig.postAverageRescueExit,
    ).toMatchObject({
      enabled: true,
      thresholds: [
        { minAveragingCount: 1, minNetPnlPct: 1.25 },
        { minAveragingCount: 2, minNetPnlPct: 0 },
        { minAveragingCount: 3, minNetPnlPct: -0.5 },
      ],
    });
  });

  it("updates post-average stop loss thresholds", () => {
    const setConfigDraft = vi.fn();
    render(
      <SettingsDialogTradingTab
        configDraft={configDraft}
        dashboardState={dashboardState}
        setConfigDraft={setConfigDraft}
      />,
    );

    fireEvent.click(
      screen
        .getByText("7. Post-average stop loss")
        .closest("button") as HTMLButtonElement,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Enable post-average stop loss" }),
    );
    const enableConfig = setConfigDraft.mock.calls.at(-1)?.[0];
    const enabledDraft = enableConfig(configDraft);
    expect(enabledDraft.modelConfig.postAverageStopLoss?.enabled).toBe(true);
  });
});
