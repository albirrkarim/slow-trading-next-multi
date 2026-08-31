/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DebugEvaluation from "@/components/dev/DynamicTrade/Debug/Evaluation";
import type { DynamicTradeBacktestReturn } from "@/components/api/dynamic";

vi.mock("@/components/dev/DynamicTrade/Debug/Pie", () => ({
  default: ({
    ariaLabel,
    dataObject,
    outcomeStats,
  }: {
    ariaLabel: string;
    dataObject: Record<string, number>;
    outcomeStats?: Record<string, { losses: number; wins: number }>;
  }) => (
    <div aria-label={ariaLabel}>
      {JSON.stringify({ dataObject, outcomeStats })}
    </div>
  ),
}));

vi.mock("@/components/dev/Evaluation/BarChartMeanHolding", () => ({
  default: () => <div data-testid="holding-chart" />,
}));

vi.mock("@/components/dev/Evaluation/TradingPerformanceReport", () => ({
  default: () => null,
}));

vi.mock("@/components/dev/Evaluation/PassiveIncomeReport", () => ({
  default: () => null,
}));

vi.mock("@/components/dev/Evaluation/MonthlyProfitReport", () => ({
  compactTradeLabel: () => "debug trade chip",
  default: () => null,
  MonthlyTradeChartDialog: ({ chip }: { chip: React.ReactNode }) => <>{chip}</>,
}));

describe("dynamic-trade evaluation pie charts", () => {
  it("starts collapsed and combines profit counts with coin outcome metrics", () => {
    const data = {
      evaluation: {
        positionPerformance: [],
        stability: {
          avgMonthlyProfit: 0,
          monthlyProfitMap: {
            "2026-01": {
              currentBalance: 0,
              total: -1,
              trades: [],
              tradesInfos: [
                {
                  date: 1,
                  profit: -1,
                  trade: {
                    message: "[EXIT] BTC LONG",
                    positionsBefore: [
                      {
                        opened: { t: 2 },
                        symbol: "BTC",
                      },
                    ],
                    time: 20,
                  },
                },
              ],
            },
          },
          months: ["2026-01"],
        },
      },
      tradeCountMap: { BTC: 4, ETH: 3 },
      tradeHistory: [
        { entryTime: 1, exitReason: "TAKE_PROFIT", netProfitUSDT: 2, symbol: "BTC" },
        {
          entryTime: 2,
          exitReason: "STOP_LOSS",
          exitTime: 20,
          netProfitUSDT: -1,
          symbol: "BTC",
        },
        { entryTime: 3, exitReason: "TAKE_PROFIT", netProfitUSDT: 3, symbol: "ETH" },
        { entryTime: 4, exitReason: "STOP_LOSS", netProfitUSDT: -2, symbol: "SOL" },
        { entryTime: 5, exitReason: "MANUAL", netProfitUSDT: 0, symbol: "SOL" },
      ],
    } as unknown as DynamicTradeBacktestReturn;

    render(<DebugEvaluation data={data} />);

    expect(screen.queryByLabelText("Total trades by coin pie chart")).toBeNull();
    expect(screen.queryByLabelText("Profit count by coin pie chart")).toBeNull();
    expect(screen.queryByLabelText("Exit reason count pie chart")).toBeNull();

    expect(screen.getByLabelText("Trade analysis pie charts").children.length).toBe(3);

    fireEvent.click(screen.getByText("Positions performance"));
    expect(screen.getByTestId("holding-chart")).toBeTruthy();

    fireEvent.click(screen.getByText("Total trades by coin"));
    expect(screen.getByLabelText("Total trades by coin pie chart").textContent).toBe(
      '{"dataObject":{"BTC":4,"ETH":3}}',
    );

    fireEvent.click(screen.getByText("Profit count by coin"));
    expect(
      screen.getByLabelText("Profit count by coin pie chart").textContent,
    ).toBe(
      '{"dataObject":{"BTC":1,"ETH":1,"SOL":0},"outcomeStats":{"BTC":{"losses":1,"wins":1},"ETH":{"losses":0,"wins":1},"SOL":{"losses":1,"wins":0}}}',
    );

    fireEvent.click(screen.getByText("Exit reason count"));
    expect(
      screen.getByLabelText("Exit reason count pie chart").textContent,
    ).toBe(
      '{"dataObject":{"TAKE PROFIT":2,"STOP LOSS":2,"MANUAL":1}}',
    );
    expect(screen.getByText("debug trade chip")).toBeTruthy();
  });
});
