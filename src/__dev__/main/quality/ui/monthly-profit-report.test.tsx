/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MonthlyProfitReport from "@/components/dev/Evaluation/MonthlyProfitReport";
import type { Marker } from "@/components/LiveDashboard/converter";
import { TradingMode } from "@/lib/exchange";
import type { Position } from "@/lib/trading/models";
import { createTestPosition } from "../fixtures/position";

vi.mock(
  "@/components/LiveDashboard/Shared/TradeChartBase",
  () => ({
    default: ({
      activePosition,
      dashedEntryPriceLine,
      header,
      markers,
      volatilitySource,
    }: {
      activePosition?: Pick<Position, "exposure" | "opened" | "strategy">;
      dashedEntryPriceLine?: boolean;
      header?: React.ReactNode;
      markers?: Marker[];
      volatilitySource?: "generated" | "storage";
    }) => (
      <div
        data-active-average-entry={activePosition?.exposure.averageEntryPrice}
        data-active-averaging-count={
          activePosition?.strategy.averaging.executions?.length ?? 0
        }
        data-active-initial-entry={activePosition?.opened.price}
        data-dashed-entry-line={String(Boolean(dashedEntryPriceLine))}
        data-history-marker-labels={(markers ?? [])
          .map((marker) => marker.text)
          .join("|")}
        data-testid="trade-chart"
        data-volatility-source={volatilitySource}
      >
        {header}
      </div>
    ),
  }),
);

vi.mock("@/components/ui/ButtonDialog", () => ({
  default: ({
    children,
  }: {
    children: () => React.ReactNode;
  }) => <>{children()}</>,
}));

vi.mock("@/components/dev/Evaluation/HeaderMetrics", () => ({
  default: ({
    children,
  }: {
    children: (expanded: boolean) => React.ReactNode;
  }) => <>{children(true)}</>,
}));

describe("MonthlyProfitReport", () => {
  it("generates volatility points for historical trade review charts", () => {
    const entryTime = Date.parse("2026-03-01T00:30:00+07:00");
    const averagingTime = Date.parse("2026-03-02T04:30:00+07:00");
    const exitTime = Date.parse("2026-03-10T08:05:00+07:00");
    const position = createTestPosition({
      averaging: {
        entryLevel: 2,
        executions: [
          {
            allocationPct: 2,
            level: 3,
            marginUsdt: 12,
            price: 2.15,
            t: averagingTime,
          },
        ],
        lastHandledLevel: 3,
        reserveBaseMarginUsdt: 6,
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
      direction: "SHORT",
      entryId: "T_review_01_03_26_00_30",
      entryLevel: 2,
      entryPrice: 1.6339,
      entryTime,
      marginUsdt: 6,
      symbol: "ZRO",
      tradingMode: TradingMode.FUTURES,
    });
    position.exposure.averageEntryPrice = 1.9773;
    const trade = {
      message: "[EXIT] ZRO (Entry 2 Exit 4 Lev 3) SHORT",
      price: 2.0906,
      profit: -6,
      time: exitTime,
      positionsBefore: [position],
    };

    render(
      <MonthlyProfitReport
        stability={
          {
            avgMonthlyProfit: -6,
            monthlyProfitMap: {
              "2026-03": {
                currentBalance: 14,
                total: -6,
                trades: ["(10) -$6.00 [EXIT] ZRO SHORT"],
                tradesInfos: [{ profit: -6, trade }],
              },
            },
            months: ["2026-03"],
          } as any
        }
      />,
    );

    const chart = screen.getByTestId("trade-chart");
    expect(chart.getAttribute("data-volatility-source")).toBe("generated");
    expect(screen.getByText("Entry ID:")).toBeTruthy();
    expect(screen.getByText("T_review_01_03_26_00_30")).toBeTruthy();

    // BTEST:BACKTEST_TRADE_CHART_AVERAGING
    expect(chart.getAttribute("data-active-initial-entry")).toBe("1.6339");
    expect(chart.getAttribute("data-active-average-entry")).toBe("1.9773");
    expect(chart.getAttribute("data-active-averaging-count")).toBe("1");
    expect(chart.getAttribute("data-dashed-entry-line")).toBe("true");
    expect(chart.getAttribute("data-history-marker-labels")).not.toContain(
      "AVG L3",
    );
    expect(screen.getByText("Averaging:").parentElement?.textContent).toBe(
      "Averaging: 1 execution",
    );
    expect(
      screen.getByText(
        /#1 · L3 · 2x · margin \$12\.00 · price 2\.15/,
      ),
    ).toBeTruthy();

    // BOTH:REUSABLE_LEVEL_SEQUENCE
    const sequence = screen.getByLabelText("Position level sequence");
    expect(
      within(sequence)
        .getAllByText(/^L/)
        .map((chip) => chip.textContent),
    ).toEqual(["L2", "L3 AVG 2x", "L4 EXIT"]);
  });

  it("states when the selected backtest trade was not averaged", () => {
    const entryTime = Date.parse("2026-04-01T01:00:00+07:00");
    const exitTime = Date.parse("2026-04-01T03:00:00+07:00");
    const position = createTestPosition({
      direction: "LONG",
      entryId: "B_review_01_04_26_01_00",
      entryLevel: -1,
      entryPrice: 1.2,
      entryTime,
      symbol: "ARB",
      tradingMode: TradingMode.FUTURES,
    });
    const trade = {
      message: "[EXIT] ARB (Entry -1 Exit 0 Lev 1) LONG",
      price: 1.25,
      profit: 0.5,
      time: exitTime,
      positionsBefore: [position],
    };

    render(
      <MonthlyProfitReport
        stability={
          {
            avgMonthlyProfit: 0.5,
            monthlyProfitMap: {
              "2026-04": {
                currentBalance: 20.5,
                total: 0.5,
                trades: ["(01) +$0.50 [EXIT] ARB LONG"],
                tradesInfos: [{ profit: 0.5, trade }],
              },
            },
            months: ["2026-04"],
          } as any
        }
      />,
    );

    // BTEST:BACKTEST_TRADE_CHART_AVERAGING
    expect(screen.getByText("Averaging:").parentElement?.textContent).toBe(
      "Averaging: Not averaged",
    );
    const sequence = screen.getByLabelText("Position level sequence");
    expect(
      within(sequence)
        .getAllByText(/^L/)
        .map((chip) => chip.textContent),
    ).toEqual(["L1", "L0 EXIT"]);
  });
});
