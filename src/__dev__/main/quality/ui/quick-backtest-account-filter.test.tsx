/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import QuickBacktestTradeHistory, {
  filterQuickBacktestTradeHistory,
} from "@/components/LiveDashboard/Feature/QuickBacktestTradeHistory";
import type { SlowQuickBacktestResult } from "@/lib/slowTrading";

vi.mock("@/components/LiveDashboard/Reporting/TradesTableSection", () => ({
  TradesTableSection: ({
    history,
  }: {
    history: SlowQuickBacktestResult["tradeHistory"];
  }) => (
    <div data-testid="quick-backtest-history">
      {history.map((trade) => trade.symbol).join(",")}
    </div>
  ),
}));

const history = [
  { account: "account-1", symbol: "AAVE" },
  { account: "account-2", symbol: "LINK" },
  { account: "account-1", symbol: "SUI" },
] as SlowQuickBacktestResult["tradeHistory"];

describe("Quick Backtest account history filter", () => {
  it("keeps the combined order and filters by the position account slug", () => {
    expect(
      filterQuickBacktestTradeHistory(history, "account-1").map(
        (trade) => trade.symbol,
      ),
    ).toEqual(["AAVE", "SUI"]);
    expect(filterQuickBacktestTradeHistory(history, "")).toBe(history);
  });

  it("defaults to Combined and switches the table to one enabled account", async () => {
    const user = userEvent.setup();

    render(
      <QuickBacktestTradeHistory
        accounts={[
          { name: "Account 1", slug: "account-1" },
          { name: "Account 2", slug: "account-2" },
        ]}
        exchangeType="binance"
        history={history}
      />,
    );

    expect(screen.getByTestId("quick-backtest-history").textContent).toBe(
      "AAVE,LINK,SUI",
    );
    expect(screen.getByText("Showing 3 of 3 trades")).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Account view" }));
    await user.click(screen.getByRole("option", { name: "Account 2 (1)" }));

    expect(screen.getByTestId("quick-backtest-history").textContent).toBe(
      "LINK",
    );
    expect(screen.getByText("Showing 1 of 3 trades")).toBeTruthy();
  });
});
