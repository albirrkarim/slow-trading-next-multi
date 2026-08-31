import { describe, expect, it } from "vitest";

import { computeDayPreview } from "@/components/LiveDashboard/Navbar/helpers";
import slowTradingDailyPnlLimit from "@/lib/slowTrading/daily-pnl-limit";

function closedTrade(params: {
  closedAt: number;
  netUsdt: number;
}) {
  return {
    closed: { t: params.closedAt },
    opened: { t: params.closedAt - 60_000 },
    pnl: { netUsdt: params.netUsdt },
  };
}

describe("daily PnL automatic-entry stop", () => {
  it("uses the navbar net UTC-day USD PnL instead of accumulated losses", () => {
    const now = Date.UTC(2026, 7, 31, 12);
    const positions = [
      closedTrade({ closedAt: Date.UTC(2026, 7, 31, 1), netUsdt: -60 }),
      closedTrade({ closedAt: Date.UTC(2026, 7, 31, 2), netUsdt: 15 }),
      closedTrade({ closedAt: Date.UTC(2026, 7, 30, 23), netUsdt: -100 }),
    ];

    // PROD:AUTO_ENTRY_DAILY_PNL_LIMIT_USDT
    const evaluation = slowTradingDailyPnlLimit.guard.evaluate({
      currentTimeMs: now,
      positions,
      thresholdUsdt: -50,
    });
    const navbar = computeDayPreview(
      { history: positions } as any,
      new Date(now),
    );

    expect(evaluation.pnlUsdt).toBe(-45);
    expect(evaluation.reached).toBe(false);
    expect(navbar.dailyUsdtProfit).toBe(evaluation.pnlUsdt);
  });

  it("blocks at the threshold and normalizes invalid settings to minus 50", () => {
    const currentTimeMs = Date.UTC(2026, 7, 31, 12);
    const positions = [
      closedTrade({ closedAt: currentTimeMs - 60_000, netUsdt: -50 }),
    ];

    expect(
      slowTradingDailyPnlLimit.guard.evaluate({
        currentTimeMs,
        positions,
        thresholdUsdt: -50,
      }).reached,
    ).toBe(true);
    expect(
      slowTradingDailyPnlLimit.config.normalizeThresholdUsdt("invalid"),
    ).toBe(-50);
    expect(
      slowTradingDailyPnlLimit.config.normalizeThresholdUsdt(25),
    ).toBe(0);
  });
});
