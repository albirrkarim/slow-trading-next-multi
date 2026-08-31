import { TradingMode } from "@/lib/exchange";
import slowTrading, { type SlowTradingStorageData } from "@/lib/slowTrading";

const storageApi = slowTrading.storage;
import {
  computeBalanceSummary,
  computeDayPreview,
  computeOpenPositionSummary,
  formatDailyPnlMetaTitle,
} from "@/components/LiveDashboard/Navbar/helpers";
import { createTestPosition } from "../fixtures/position";

function createStorage(): SlowTradingStorageData {
  return {
    config: {
      exchangeType: "tokocrypto",
      symbols: ["SUI"],
      tradingMode: TradingMode.SPOT,
    } as any,
    runtime: {
      sandboxEnabled: false,
    } as any,
    modes: {
      live: {
        tradeSettings: [
          {
            symbol: "SUI",
            model_memory: {
              positions: [
                createTestPosition({
                  executionMode: "live",
                  marginUsdt: 40,
                  notionalUsdt: 40,
                  quantity: 4,
                  symbol: "SUI",
                  tradingMode: TradingMode.SPOT,
                  entryTime: 1,
                  entryPrice: 10,
                  leverage: 1,
                }),
              ],
              positionsSell: [],
            },
          },
        ],
        dynamicTradeMemory: {
          startingBalanceUSDT: 1000,
          quoteAsset: 900,
          reservedQuoteAsset: 250,
          safeHaven: 100,
          safeHavenRequest: 0,
          safeHavenHistory: [],
          volatilitySnapshots: [],
          priceNormMapOverTime: {},
        },
      },
      sandbox: {
        tradeSettings: [],
        dynamicTradeMemory: {
          startingBalanceUSDT: 1000,
          quoteAsset: 1000,
          reservedQuoteAsset: 0,
          safeHaven: 0,
          safeHavenRequest: 0,
          safeHavenHistory: [],
          volatilitySnapshots: [],
          priceNormMapOverTime: {},
        },
      },
    },
    updatedAt: 1,
  };
}

describe("slow specs balance", () => {
  it("builds the A.3 balance categories and total asset", () => {
    const dashboardState = storageApi.dashboard.buildState(createStorage());

    // BOTH:BALANCE_AVAILABLE
    expect(dashboardState.balances.availableQuoteAsset).toBe(1000);
    // BOTH:BALANCE_RESERVED
    expect(dashboardState.balances.reservedQuoteAsset).toBe(250);
    // BOTH:BALANCE_LOCKED
    expect(dashboardState.balances.lockedQuoteAsset).toBe(40);
    // BOTH:BALANCE_SAFE_HAVEN
    expect(dashboardState.balances.safeHaven).toBe(100);
    // BOTH:BALANCE_SPENDABLE
    expect(dashboardState.balances.spendableQuoteAsset).toBe(650);

    const openPositionSummary = computeOpenPositionSummary(dashboardState);
    const balanceSummary = computeBalanceSummary(
      dashboardState,
      openPositionSummary,
    );

    expect(openPositionSummary.lockedCapitalUSDT).toBe(40);
    // PROD:TOTAL_ASSET
    expect(balanceSummary.total).toBe(1040);
  });

  it("keeps available stable and adjusts spendable when Safe Haven is edited", () => {
    const storage = createStorage();
    storage.runtime.sandboxEnabled = true;
    storage.modes.sandbox.dynamicTradeMemory.quoteAsset = 1018.53;

    storageApi.safeHaven.applyUpdate(storage.modes.sandbox, 20);
    const dashboardState = storageApi.dashboard.buildState(storage);

    // BOTH:BALANCE_AVAILABLE
    expect(dashboardState.balances.availableQuoteAsset).toBe(1018.53);
    // BOTH:BALANCE_SAFE_HAVEN
    expect(dashboardState.balances.safeHaven).toBe(20);
    // BOTH:BALANCE_SPENDABLE
    expect(dashboardState.balances.spendableQuoteAsset).toBe(998.53);
  });

  it("shows zero navbar daily pnl when the latest trade is not today", () => {
    const dayPreview = computeDayPreview(
      {
        history: [
          createTestPosition({
            entryTime: Date.UTC(2026, 5, 7, 1),
            netPct: 14.79,
            netUsdt: 4.88,
            symbol: "SUI",
            closed: {
              t: Date.UTC(2026, 5, 7, 8),
              price: 11,
              feeUsdt: 0,
              reason: "TAKE_PROFIT",
            },
          }),
        ],
      } as any,
      new Date(Date.UTC(2026, 5, 11, 0)),
    );

    expect(dayPreview.dailyUsdtProfit).toBe(0);
    expect(dayPreview.dailyPnlPercentSum).toBe(0);
  });

  it("shows navbar daily pnl for trades closed today", () => {
    const dayPreview = computeDayPreview(
      {
        history: [
          createTestPosition({
            entryTime: Date.UTC(2026, 5, 11, 1),
            netPct: 2.5,
            netUsdt: 1.25,
            symbol: "SUI",
            closed: {
              t: Date.UTC(2026, 5, 11, 8),
              price: 11,
              feeUsdt: 0,
              reason: "TAKE_PROFIT",
            },
          }),
        ],
      } as any,
      new Date(Date.UTC(2026, 5, 11, 12)),
    );

    expect(dayPreview.dailyUsdtProfit).toBe(1.25);
    expect(dayPreview.dailyPnlPercentSum).toBe(2.5);
  });

  it("formats the UTC daily PnL browser title with APP_NAME", () => {
    // PROD:DAILY_PNL_META_TITLE
    expect(formatDailyPnlMetaTitle("fund.example.com", 1.74)).toBe(
      "fund.example.com | +$1.74",
    );
    expect(formatDailyPnlMetaTitle("fund.example.com", -0.19)).toBe(
      "fund.example.com | -$0.19",
    );
    expect(formatDailyPnlMetaTitle("", Number.NaN)).toBe("SLOW | +$0.00");
  });
});
