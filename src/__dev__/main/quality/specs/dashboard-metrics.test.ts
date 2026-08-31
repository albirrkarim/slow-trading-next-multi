import { calculateSlowWorkerCapacity } from "@/components/LiveDashboard/Feature/worker-capacity";
import { buildEntrySequenceHoldDurationDistribution } from "@/components/LiveDashboard/Feature/entry-sequence-hold-duration";
import {
  buildMaxEntryVolumeTooltip,
  estimateMaxEntryFromVolume24h,
  getEstimatedMaxEntryRiskColor,
} from "@/components/LiveDashboard/Feature/LatestVolatilityPoints";
import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import type { VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange";
import slowTrading, { type SlowTradingDashboardState } from "@/lib/slowTrading";
import { describe, expect, it } from "vitest";
import { createTestPosition } from "../fixtures/position";

function point(symbol: string, lvl: number, t: number): VolatilityPoint {
  return {
    id: `${symbol}_${t}`,
    l: lvl < 0 ? "B" : "T",
    lvl,
    p: 1,
    pct: 5,
    symbol,
    t,
    vb: 1,
    vq: 1,
  } as VolatilityPoint;
}

function signal(source: VolatilityPoint): EntryRecommendation {
  return {
    ...source,
    amountProbab: 1,
    maxLeverage: 1,
    message: "historical entry",
  };
}

describe("SLOW dashboard capacity metrics", () => {
  it("estimates latest-card max entry from 24h quote volume", () => {
    const tooltip = buildMaxEntryVolumeTooltip({
      estimatedMaxEntry: estimateMaxEntryFromVolume24h({
        volume24h: 5_000_000,
      }),
      volume24h: 5_000_000,
    });

    // PROD:LATEST_VOLATILITY_VOLUME_24H
    expect(estimateMaxEntryFromVolume24h({ volume24h: 5_000_000 })).toBe(
      10_000,
    );
    expect(
      estimateMaxEntryFromVolume24h({
        maxEntryBased24HourVolPct: 0.3,
        volume24h: 5_000_000,
      }),
    ).toBe(15_000);
    expect(
      estimateMaxEntryFromVolume24h({
        maxEntryBased24HourVolPct: 0.5,
        volume24h: 5_000_000,
      }),
    ).toBe(25_000);
    expect(estimateMaxEntryFromVolume24h({ volume24h: undefined })).toBeUndefined();
    expect(estimateMaxEntryFromVolume24h({ volume24h: 0 })).toBeUndefined();
    expect(tooltip).toContain(
      "Formula: 24h volume × 0.2% = estimated sizing budget.",
    );
    expect(tooltip).toContain("$5M × 0.2% = $10K");
    expect(tooltip).toContain("$1M → $2K");
    expect(tooltip).toContain("Order-book depth with slippage would be better.");
  });

  it("colors estimated max entry against one worker cost", () => {
    expect(
      getEstimatedMaxEntryRiskColor({
        estimatedMaxEntry: 900,
        workerCostUsdt: 1_000,
      }),
    ).toBe("#e53935");
    expect(
      getEstimatedMaxEntryRiskColor({
        estimatedMaxEntry: 1_100,
        workerCostUsdt: 1_000,
      }),
    ).toBe("#f57c00");
    expect(
      getEstimatedMaxEntryRiskColor({
        estimatedMaxEntry: 2_000,
        workerCostUsdt: 1_000,
      }),
    ).toBe("text.secondary");
  });

  it("counts one selected-engine entry per sequence and direction", () => {
    const sol = [
      point("SOL", 0, 1),
      point("SOL", 1, 2),
      point("SOL", 3, 3),
      point("SOL", 4, 4),
      point("SOL", 0, 5),
      point("SOL", 2, 6),
      point("SOL", 0, 7),
      point("SOL", -1, 8),
      point("SOL", -3, 9),
      point("SOL", -4, 10),
      point("SOL", 0, 11),
    ];

    const result = slowTrading.entrySequences.count({
      entrySignals: [signal(sol[2]), signal(sol[3]), signal(sol[8])],
      volatilityMap: { SOL: sol },
    });

    // PROD:HISTORICAL_ENTRY_SEQUENCES
    expect(result).toEqual([
      { long: 1, short: 1, symbol: "SOL", total: 2 },
    ]);

    const ranged = slowTrading.entrySequences.range.crop({
      endTimeMs: 7,
      startTimeMs: 5,
      volatilityMap: { SOL: sol },
    });
    expect(ranged.SOL.map((item) => item.t)).toEqual([5, 6, 7]);
  });

  it("groups entry sequence hold durations into fixed ranges", () => {
    const minuteMs = 60 * 1000;
    const intervals = [10, 15, 75, 6000].map((minutes, index) => ({
      endTimeMs: (minutes + 1) * minuteMs,
      entrySignal: signal(point("SOL", 3, minuteMs)),
      label: "T" as const,
      startTimeMs: minuteMs,
      symbol: `COIN${index}`,
    }));

    const result = buildEntrySequenceHoldDurationDistribution(intervals);

    // PROD:ENTRY_SEQUENCE_HOLD_DURATION_DISTRIBUTION
    expect(result.map(({ count, label }) => ({ count, label }))).toEqual([
      { count: 1, label: "<15m" },
      { count: 1, label: "15–30m" },
      { count: 0, label: "30m–1h" },
      { count: 1, label: "1–2h" },
      { count: 0, label: "2–4h" },
      { count: 0, label: "4–8h" },
      { count: 0, label: "8–24h" },
      { count: 0, label: "1–3d" },
      { count: 1, label: "3d+" },
    ]);
    expect(result[0].share).toBe(25);
  });

  it("estimates worker need from colliding historical entry sequences", () => {
    const sol = [point("SOL", 0, 1), point("SOL", 2, 2), point("SOL", 0, 5)];
    const inj = [point("INJ", 0, 1), point("INJ", -2, 3), point("INJ", 0, 6)];
    const apt = [point("APT", 0, 1), point("APT", 3, 7), point("APT", 0, 9)];

    const result = slowTrading.entrySequences.workerNeeded.estimate({
      endTimeMs: 10,
      entrySignals: [signal(sol[1]), signal(inj[1]), signal(apt[1])],
      startTimeMs: 1,
      volatilityMap: { APT: apt, INJ: inj, SOL: sol },
    });

    // PROD:WORKER_NEEDED_ESTIMATION
    expect(result.metrics.min).toBe(0);
    expect(result.metrics.max).toBe(2);
    expect(result.metrics.avg).toBeCloseTo(8 / 9, 5);
    expect(result.points).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 1 },
      { t: 3, v: 2 },
      { t: 5, v: 1 },
      { t: 6, v: 0 },
      { t: 7, v: 1 },
      { t: 9, v: 0 },
      { t: 10, v: 0 },
    ]);
  });

  it("keeps min worker need above zero when the full range is occupied", () => {
    const sol = [point("SOL", 2, 1), point("SOL", 0, 5)];

    const result = slowTrading.entrySequences.workerNeeded.estimate({
      endTimeMs: 5,
      entrySignals: [signal(sol[0])],
      startTimeMs: 1,
      volatilityMap: { SOL: sol },
    });

    // PROD:WORKER_NEEDED_ESTIMATION
    expect(result.metrics).toEqual({ avg: 1, max: 1, min: 1 });
    expect(result.points).toEqual([
      { t: 1, v: 1 },
      { t: 5, v: 0 },
    ]);
  });

  it("estimates system maximal capacity from 24h-volume capped entry sequences", () => {
    const sol = [point("SOL", 0, 1), point("SOL", 3, 2), point("SOL", 0, 5)];
    const inj = [point("INJ", 0, 1), point("INJ", -3, 3), point("INJ", 0, 6)];

    const result = slowTrading.entrySequences.systemCapacity.estimate({
      config: {
        name: "test",
        description: "",
        symbols: ["SOL", "INJ"],
        exchangeType: "binance",
        tradingMode: TradingMode.FUTURES,
        modelConfig: {
          takeProfitPercent: 5,
          stopLossPercent: 20,
        } as any,
        enableWatchLogic: true,
        maxEntryBased24HourVolPct: 0.2,
        maxEntryMargin: 0,
        maxEntryMarginPct: 0,
        maxLeverage: 2,
        watchReserveLevels: 2,
        watchReservePctAlloc: 2,
      },
      endTimeMs: 6,
      entrySignals: [signal(sol[1]), signal(inj[1])],
      startTimeMs: 1,
      volatilityMap: { INJ: inj, SOL: sol },
      volume24hBySymbol: {
        INJ: 100_000,
        SOL: 50_000,
      },
    });

    // PROD:SYSTEM_MAXIMAL_CAPACITY
    expect(result.metrics).toEqual({
      avgWorkers: 1.2,
      maxEffectiveCapitalUsdt: 300,
      maxProfitPct: 1,
      maxProfitUsdt: 3,
      maxWorkers: 2,
      minWorkers: 0,
      sequenceCount: 2,
      totalEntryMarginUsdt: 30,
      totalWorkerCostUsdt: 270,
    });
    expect(result.capitalPoints).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 100 },
      { t: 3, v: 300 },
      { t: 5, v: 200 },
      { t: 6, v: 0 },
    ]);
    expect(result.sequences.map((sequence) => sequence.entryMarginUsdt)).toEqual([
      20,
      10,
    ]);
  });

  it("uses reserve caps and preserves bailout capital for available workers", () => {
    const dashboardState = {
      balances: { spendableQuoteAsset: 630 },
      config: {
        enableWatchLogic: true,
        maxEntryMargin: 7,
        maxEntryMarginPct: 0,
        maxOpenPositions: 3,
        watchReserveLevels: 2,
        watchReservePctAlloc: 2,
      },
      openPositions: [
        createTestPosition({
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
    } as unknown as SlowTradingDashboardState;

    const capacity = calculateSlowWorkerCapacity(dashboardState);

    // PROD:AVAILABLE_ENTRY_WORKERS
    expect(capacity).toMatchObject({
      availableWorkers: 2,
      balanceAvailableWorkers: 8,
      bailoutBufferUsdt: 100,
      currentOpenPositions: 1,
      entryMarginUsdt: 7,
      maxOpenPositions: 3,
      remainingPositionSlots: 2,
      spendableUsdt: 630,
      workerCostUsdt: 63,
    });
  });
});
