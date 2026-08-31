import { getBlackSwanChartWindow } from "@/components/dev/BlackSwanBacktest/chart-focus";
import type { BlackSwanBacktestResult } from "@/lib/devBacktest/black-swan";
import blackSwan from "@/lib/trading/black-swan";
import { describe, expect, it } from "vitest";

const MINUTE_MS = 60_000;

function result(
  transitions: BlackSwanBacktestResult["transitions"],
): BlackSwanBacktestResult {
  return {
    config: blackSwan.config.defaults,
    symbols: ["BTC", "ETH"],
    startTime: 0,
    endTime: 180 * MINUTE_MS,
    points: [
      {
        t: 0,
        price: 100,
        status: "NORMAL",
        reason: "HEALTHY",
      },
      {
        t: 180 * MINUTE_MS,
        price: 90,
        status: "NORMAL",
        reason: "HEALTHY",
      },
    ],
    transitions,
    summary: {
      candleCount: 181,
      crisisMinutes: 0,
      dataStaleMinutes: 0,
      maxBreadthPct: 0,
      maxDrawdownPct: 0,
      protectiveMinutes: 0,
      watchMinutes: 0,
    },
  };
}

describe("Black Swan backtest chart focus", () => {
  it("includes 30 minutes around the first incident through recovery", () => {
    const chartWindow = getBlackSwanChartWindow(
      result([
        {
          t: 60 * MINUTE_MS,
          from: "NORMAL",
          to: "WATCH",
          reason: "BTC_WARNING",
        },
        {
          t: 65 * MINUTE_MS,
          from: "WATCH",
          to: "CRISIS",
          reason: "SYSTEMIC_BREADTH",
        },
        {
          t: 100 * MINUTE_MS,
          from: "RECOVERY",
          to: "NORMAL",
          reason: "HEALTHY",
        },
      ]),
    );

    expect(chartWindow).toEqual({
      endTime: 130 * MINUTE_MS,
      hasIncident: true,
      startTime: 30 * MINUTE_MS,
    });
  });

  it("uses the complete available range when no incident occurred", () => {
    expect(getBlackSwanChartWindow(result([]))).toEqual({
      endTime: 180 * MINUTE_MS,
      hasIncident: false,
      startTime: 0,
    });
  });

  it("clamps context to the available result range", () => {
    const chartWindow = getBlackSwanChartWindow(
      result([
        {
          t: 10 * MINUTE_MS,
          from: "NORMAL",
          to: "CRISIS",
          reason: "BTC_HARD_TRIGGER",
        },
        {
          t: 170 * MINUTE_MS,
          from: "RECOVERY",
          to: "NORMAL",
          reason: "HEALTHY",
        },
      ]),
    );

    expect(chartWindow).toEqual({
      endTime: 180 * MINUTE_MS,
      hasIncident: true,
      startTime: 0,
    });
  });
});
