/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import BacktestDailyPnlCalendar from "@/components/dev/DynamicTrade/BacktestDailyPnlCalendar";

describe("dynamic backtest daily PnL calendar", () => {
  it("opens the shared calendar for closed backtest trade results", async () => {
    const user = userEvent.setup();

    render(
      <BacktestDailyPnlCalendar
        data={
          {
            startingBalanceUSDT: 100,
            tradeHistory: [
              {
                symbol: "WAL",
                entryTime: Date.UTC(2026, 5, 1, 1),
                exitTime: Date.UTC(2026, 5, 1, 8),
                netProfitUSDT: 5,
              },
            ],
          } as any
        }
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Open backtest daily PnL calendar",
      }),
    );

    expect(screen.getByText("Trade Total +$5.00")).toBeDefined();
    expect(screen.getByText("Balance Δ +$5.00")).toBeDefined();
    expect(
      screen.getByText(
        "Trade PnL and running balance are reconstructed from this backtest's closed trade results.",
      ),
    ).toBeDefined();
  });
});
