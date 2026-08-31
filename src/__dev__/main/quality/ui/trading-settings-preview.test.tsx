/**
 * @vitest-environment jsdom
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ManualEntryDialog from "@/components/LiveDashboard/Feature/ManualEntryDialog";
import {
  buildTradingLivePreview,
  buildTradingLivePreviewAveragingSimulation,
} from "@/components/LiveDashboard/Feature/trading-live-preview";
import TradingSettingsPreview from "@/components/LiveDashboard/Navbar/TradingSettingsPreview";
import type {
  ConfigDraft,
  DashboardState,
} from "@/components/LiveDashboard/Navbar/types";
import type { VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import { createTestPosition } from "../fixtures/position";

const configDraft = {
  adaptiveAveraging: {
    enabled: false,
    maxMultiplier: 5,
    minProjectedProfitPct: 2,
  },
  autoEntryEnabled: true,
  autoExitEnabled: true,
  autoRemoveSymbolAbsLevel: 0,
  decisionEngineVersion: "decision.v19",
  description: "",
  enableWatchLogic: true,
  entrySignalBypass: false,
  exactLeverage: 2,
  exchangeAccountId: "1",
  exchangeAccounts: [],
  exchangeType: "binance",
  exitSidewaysToFreeWorkersForStrongCandidates: false,
  maxEntryBased24HourVolPct: 0.2,
  maxEntryMargin: 7,
  maxEntryMarginPct: 0,
  maxOpenPositions: 0,
  maxLeverage: 0,
  minActionableAbsoluteLevel: 2,
  modelConfig: {
    stopLossUSDT: 50,
    takeProfitPercent: 5,
    stopLossPercent: 20,
    volatilityTargetStopLossPercent: 2,
  },
  name: "Preview",
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
  watchReserveLevels: 2,
  watchReservePctAlloc: 2,
  withdrawalAutoEnabled: false,
  withdrawalSchedules: [],
  withdrawalWalletBook: [],
} satisfies ConfigDraft;

const dashboardState = {
  balances: {
    spendableQuoteAsset: 630,
  },
  globalConfig: {
    volatilityThresholdPct: 2,
  },
  openPositions: [
    createTestPosition({
      symbol: "SUI",
      averaging: {
        entryLevel: -3,
        lastHandledLevel: -3,
        reserveBaseMarginUsdt: 10,
        reservedRemainingMarginUsdt: 0,
        steps: [
          {
            level: -4,
            marginUsdt: 100,
            allocationPct: 2,
            status: "UNRESERVED",
          },
        ],
      },
    }),
  ],
} as unknown as DashboardState;

describe("TradingSettingsPreview", () => {
  it("finds the maximal adverse vPoint supported by the reserve multiplier", () => {
    const twoTimesSimulation = buildTradingLivePreviewAveragingSimulation({
      entryMarginUsdt: 10,
      leverage: 4,
      requiredProfitPct: 1,
      reserveMultiplier: 2,
      targetMovePct: 2,
    });
    const simulation = buildTradingLivePreviewAveragingSimulation({
      entryMarginUsdt: 10,
      leverage: 4,
      requiredProfitPct: 1,
      reserveMultiplier: 3,
      targetMovePct: 2,
    });

    // PROD:AVERAGING_LIVE_PREVIEW
    expect(twoTimesSimulation?.maxAdversePct).toBeCloseTo(2.941176, 5);
    expect(simulation).not.toBeNull();
    expect(simulation?.maxAdversePct).toBeCloseTo(3.921568, 5);
    expect(simulation?.adversePrice).toBeCloseTo(96.078432, 5);
    expect(simulation?.targetPrice).toBeCloseTo(98, 5);
    expect(simulation?.projectedProfitPct).toBeCloseTo(1, 5);
    expect(simulation?.addMarginUsdt).toBe(30);
  });

  it("limits available workers to remaining open-position slots", () => {
    const preview = buildTradingLivePreview({
      config: {
        ...configDraft,
        maxOpenPositions: 1,
      },
      dashboardState,
    });

    // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
    expect(preview).toMatchObject({
      availableWorkers: 0,
      balanceAvailableWorkers: 8,
      currentOpenPositions: 1,
      maxOpenPositions: 1,
      remainingPositionSlots: 0,
    });
  });

  it("uses current worker capacity and draft exit settings", () => {
    const preview = buildTradingLivePreview({
      config: configDraft,
      dashboardState,
    });

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(preview).toMatchObject({
      availableWorkers: 8,
      bailoutCandidates: [
        {
          level: -4,
          marginUsdt: 100,
          symbol: "SUI",
        },
      ],
      bailoutBufferUsdt: 100,
      entryBudgetUsdt: 530,
      entryMarginUsdt: 7,
      exitStages: [
        {
          averagingStepsUsed: 0,
          cumulativeMarginUsdt: 7,
          estimatedLossUsdt: 2.8,
          estimatedNotionalUsdt: 14,
          estimatedProfitUsdt: 0.7,
          estimatedTargetZoneLossUsdt: 0.28,
          stopLossUSDTEquivalentPct: 357.14,
          marginPartsUsdt: [7],
          stage: 1,
        },
        {
          averagingStepsUsed: 1,
          cumulativeMarginUsdt: 21,
          estimatedLossUsdt: 8.4,
          estimatedNotionalUsdt: 42,
          estimatedProfitUsdt: 2.1,
          estimatedTargetZoneLossUsdt: 0.84,
          stopLossUSDTEquivalentPct: 119.05,
          marginPartsUsdt: [7, 14],
          stage: 2,
        },
        {
          averagingStepsUsed: 2,
          cumulativeMarginUsdt: 63,
          estimatedLossUsdt: 25.2,
          estimatedNotionalUsdt: 126,
          estimatedProfitUsdt: 6.3,
          estimatedTargetZoneLossUsdt: 2.52,
          stopLossUSDTEquivalentPct: 39.68,
          marginPartsUsdt: [7, 14, 42],
          stage: 3,
        },
      ],
      leverage: 2,
      reserveBudgetUsdt: 56,
      reserveStepsUsdt: [14, 42],
      spendableUsdt: 630,
      stopLossUSDT: 50,
      targetZoneStopLossPct: 2,
      workerCostUsdt: 63,
    });
  });

  it("previews the first stop outcome after each averaging tier", () => {
    const stopConfig = {
      ...configDraft,
      modelConfig: {
        ...configDraft.modelConfig,
        stopLossUSDT: 14,
        postAverageStopLoss: {
          enabled: true,
          thresholds: [
            { minAveragingCount: 1, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
          ],
        },
      },
    };
    const preview = buildTradingLivePreview({
      config: stopConfig,
      dashboardState,
    });

    expect(preview.exitStages[0].firstStopLoss).toMatchObject({
      estimatedLossUsdt: 2.8,
      type: "HARD_STOP_PERCENT",
    });
    expect(preview.exitStages[1].firstStopLoss).toMatchObject({
      estimatedLossUsdt: 0.84,
      type: "POST_AVERAGE",
    });
    expect(preview.exitStages[2].firstStopLoss).toMatchObject({
      estimatedLossUsdt: 2.52,
      type: "POST_AVERAGE",
    });

    render(
      <TradingSettingsPreview
        configDraft={stopConfig}
        dashboardState={dashboardState}
      />,
    );
    expect(screen.getAllByText("FIRST STOP OUTCOME")).toHaveLength(3);
    expect(screen.getAllByText(/Post-average stop reaches first/)).toHaveLength(
      2,
    );
    expect(
      screen.getAllByText("Post-average stop · tier ≥1 average · current 1"),
    ).toHaveLength(1);
    expect(
      screen.getAllByText("Post-average stop · tier ≥1 average · current 2"),
    ).toHaveLength(1);
  });

  it("renders entry capacity and per-worker profit and loss", async () => {
    render(
      <TradingSettingsPreview
        configDraft={configDraft}
        dashboardState={dashboardState}
      />,
    );

    expect(
      screen.getAllByText("$7.00 + $14.00 + $42.00 = $63.00"),
    ).toHaveLength(2);
    const bailoutPreview = screen.getByTestId("bailout-buffer-preview");
    const bailoutCandidates = within(bailoutPreview).getByTestId(
      "bailout-buffer-candidates",
    );
    expect(within(bailoutPreview).getByText("Bailout buffer")).toBeDefined();
    expect(within(bailoutCandidates).getByText("Candidates")).toBeDefined();
    expect(within(bailoutCandidates).getByText("Open positions")).toBeDefined();
    expect(within(bailoutCandidates).getByText("SUI level -4")).toBeDefined();
    const unreservedAmount =
      within(bailoutCandidates).getByText("$100.00");
    fireEvent.mouseOver(unreservedAmount);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "UNRESERVED",
    );
    fireEvent.mouseOut(unreservedAmount);
    await waitFor(() => expect(screen.queryByText("UNRESERVED")).toBeNull());
    expect(
      within(bailoutCandidates).getByText("Preserved maximum"),
    ).toBeDefined();
    expect(
      within(bailoutCandidates).getByText("max($100.00) = $100.00"),
    ).toBeDefined();
    expect(screen.getByText("Available workers")).toBeDefined();
    expect(screen.getByTestId("averaging-simulation-preview")).toBeDefined();
    expect(screen.getByText("Averaging")).toBeDefined();
    expect(screen.getByText("BOTTOM L1")).toBeDefined();
    expect(screen.getByText("BOTTOM L2")).toBeDefined();
    expect(screen.getByText("TOP L0")).toBeDefined();
    expect(
      screen.getByText("floor($530.00 / $63.00) = 8"),
    ).toBeDefined();
    expect(screen.getByText("Stage 1 - Entry only")).toBeDefined();
    expect(screen.getByText("$7.00 x 2x = $14.00")).toBeDefined();
    expect(screen.getByText("Stage 2 - After averaging 1")).toBeDefined();
    expect(screen.getByText("$7.00 + $14.00 = $21.00")).toBeDefined();
    expect(screen.getByText("$21.00 x 2x = $42.00")).toBeDefined();
    expect(screen.getByText("Stage 3 - After averaging 2")).toBeDefined();
    expect(screen.getByText("$63.00 x 2x = $126.00")).toBeDefined();
    expect(screen.getAllByText("Profit at TP (5%)")).toHaveLength(3);
    expect(screen.getByText("$14.00 x 5% = +$0.70")).toBeDefined();
    expect(screen.getByText("$126.00 x 5% = +$6.30")).toBeDefined();
    expect(screen.getAllByText("Loss at SL (20%)")).toHaveLength(3);
    expect(screen.getAllByText("$14.00 x 20% = -$2.80")).toHaveLength(2);
    expect(screen.getAllByText("$126.00 x 20% = -$25.20")).toHaveLength(2);
    expect(
      screen.getAllByText("Net USDT stop loss ($50.00)"),
    ).toHaveLength(3);
    expect(
      screen.getByText("-$50.00 / $14.00 x 100 = -357.14%"),
    ).toBeDefined();
    expect(
      screen.getByText("-$50.00 / $126.00 x 100 = -39.68%"),
    ).toBeDefined();
    expect(
      screen.getAllByText("Loss at target-zone SL (2%)"),
    ).toHaveLength(3);
    expect(screen.getByText("$14.00 x 2% = -$0.28")).toBeDefined();
    expect(screen.getByText("$126.00 x 2% = -$2.52")).toBeDefined();
    expect(
      within(screen.getByTestId("threshold-target-zone-stop")).getByText(
        "-2%",
      ),
    ).toBeDefined();

    fireEvent.mouseOver(screen.getByText("$21.00 x 2x = $42.00"));
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "cumulative margin x leverage",
    );
  });

  it("previews unreserved stages through max next averaging levels", () => {
    const preview = buildTradingLivePreview({
      config: {
        ...configDraft,
        watchMaxNextAveragingLevels: 3,
        watchReserveLevels: 1,
      },
      dashboardState,
    });

    expect(preview.reserveStepsUsdt).toEqual([14]);
    expect(preview.exitStages.map((stage) => stage.marginPartsUsdt)).toEqual([
      [7],
      [7, 14],
      [7, 14, 42],
      [7, 14, 42, 126],
    ]);
  });

  it("reserves the projected worker bailout with no open positions", () => {
    const emptyDashboardState = {
      balances: {
        spendableQuoteAsset: 180,
      },
      openPositions: [],
    } as unknown as DashboardState;
    const projectedWorkerConfig = {
      ...configDraft,
      exactLeverage: 3,
      maxEntryMargin: 20,
      watchMaxNextAveragingLevels: 2,
      watchReserveLevels: 1,
    };
    const preview = buildTradingLivePreview({
      config: projectedWorkerConfig,
      dashboardState: emptyDashboardState,
    });

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(preview).toMatchObject({
      availableWorkers: 1,
      bailoutBufferUsdt: 120,
      entryBudgetUsdt: 60,
      entryMarginUsdt: 20,
      projectedBailoutLevel: -2,
      projectedBailoutMultiplier: 2,
      projectedBailoutPartsUsdt: [20, 40],
      projectedBailoutUsdt: 120,
      reserveBudgetUsdt: 40,
      reserveStepsUsdt: [40],
      workerCostUsdt: 60,
    });

    render(
      <TradingSettingsPreview
        configDraft={projectedWorkerConfig}
        dashboardState={emptyDashboardState}
      />,
    );

    const bailoutCandidates = within(
      screen.getByTestId("bailout-buffer-preview"),
    ).getByTestId("bailout-buffer-candidates");
    expect(
      within(bailoutCandidates).getByText("Projected new worker level -2"),
    ).toBeDefined();
    expect(
      within(bailoutCandidates).getByText(
        "($20.00 + $40.00) x 2 = $120.00",
      ),
    ).toBeDefined();
    expect(
      within(bailoutCandidates).getByText("Preserved maximum"),
    ).toBeDefined();
    expect(
      within(bailoutCandidates).getByText("max($120.00) = $120.00"),
    ).toBeDefined();
    expect(screen.getByText("floor($60.00 / $60.00) = 1")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Read more about the bailout buffer",
      }),
    );

    expect(screen.getByText("Bailout Buffer Mechanism")).toBeDefined();
    expect(
      screen.getByText(
        "The bailout buffer is shared account spendable balance. It is not assigned to, or locked for, one specific open position.",
      ),
    ).toBeDefined();
    expect(screen.getByText("$180.00 - $60.00 = $120.00")).toBeDefined();
    expect(screen.getByText("$120.00 >= $120.00: entry allowed")).toBeDefined();
  });

  it("auto-fits uncapped entry margin to the projected bailout buffer", () => {
    const preview = buildTradingLivePreview({
      config: {
        ...configDraft,
        maxEntryMargin: 0,
        watchMaxNextAveragingLevels: 2,
        watchReserveLevels: 1,
      },
      dashboardState: {
        balances: {
          spendableQuoteAsset: 180,
        },
        openPositions: [],
      } as unknown as DashboardState,
    });

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(preview).toMatchObject({
      availableWorkers: 1,
      bailoutBufferUsdt: 120,
      entryBudgetUsdt: 60,
      entryMarginUsdt: 20,
      projectedBailoutUsdt: 120,
      reserveBudgetUsdt: 40,
      reserveStepsUsdt: [40],
      spendableUsdt: 180,
      workerCostUsdt: 60,
    });
  });

  it("does not auto-fit a configured fixed entry margin cap", () => {
    const preview = buildTradingLivePreview({
      config: {
        ...configDraft,
        maxEntryMargin: 20,
        watchMaxNextAveragingLevels: 2,
        watchReserveLevels: 1,
      },
      dashboardState: {
        balances: {
          spendableQuoteAsset: 179,
        },
        openPositions: [],
      } as unknown as DashboardState,
    });

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(preview).toMatchObject({
      availableWorkers: 0,
      bailoutBufferUsdt: 120,
      entryBudgetUsdt: 59,
      entryMarginUsdt: 20,
      workerCostUsdt: 60,
    });
  });

  it("uses a local spendable assumption without changing current spendable", () => {
    render(
      <TradingSettingsPreview
        configDraft={configDraft}
        dashboardState={dashboardState}
      />,
    );

    const spendableAssumption = screen.getByLabelText(
      "Spendable assumption",
    ) as HTMLInputElement;
    expect(spendableAssumption.value).toBe("630");
    expect(screen.getByText("floor($530.00 / $63.00) = 8")).toBeDefined();

    fireEvent.change(spendableAssumption, { target: { value: "300" } });

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(screen.getByText("Current spendable")).toBeDefined();
    expect(screen.getByText("$630.00")).toBeDefined();
    expect(screen.getByText("floor($200.00 / $63.00) = 3")).toBeDefined();

    fireEvent.change(spendableAssumption, { target: { value: "" } });
    expect(screen.getByText("floor($530.00 / $63.00) = 8")).toBeDefined();
  });

  it("reuses the standalone live preview in manual entry confirmation", () => {
    const manualDashboardState = {
      activeMode: "sandbox",
      config: configDraft,
      balances: {
        availableQuoteAsset: 630,
        spendableQuoteAsset: 630,
      },
      openPositions: dashboardState.openPositions,
    } as unknown as SlowTradingDashboardState;
    const point = {
      id: "manual-preview",
      l: "B",
      lvl: -3,
      p: 1,
      t: Date.now(),
    } as VolatilityPoint;

    render(
      <ManualEntryDialog
        dashboardState={manualDashboardState}
        disabled={false}
        onConfirm={async () => undefined}
        point={point}
        submitting={false}
        symbol="SUI"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Entry" }));

    // PROD:TRADING_ENTRY_LIVE_PREVIEW
    expect(screen.getByTestId("trading-live-preview")).toBeDefined();
    expect(screen.getByText("Confirm SUI manual entry")).toBeDefined();
    expect(screen.getByText("floor($530.00 / $63.00) = 8")).toBeDefined();
    expect(screen.queryByLabelText("Spendable assumption")).toBeNull();
  });
});
