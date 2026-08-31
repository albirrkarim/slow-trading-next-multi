/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SnackbarProvider } from "notistack";
import { describe, expect, it, vi } from "vitest";

import SlowTradingReporting from "@/components/LiveDashboard/Reporting";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import { createTestPosition } from "../fixtures/position";

vi.mock("@/components/LiveDashboard/Reporting/ChartsSection", () => ({
  ChartsSection: () => <div data-testid="history-charts" />,
}));

vi.mock("@/components/LiveDashboard/Reporting/MaxUpDistributionChart", () => ({
  default: () => <div data-testid="max-up-distribution" />,
}));

vi.mock("@/components/LiveDashboard/Reporting/SummarySection", () => ({
  SummarySection: () => <div data-testid="history-summary" />,
}));

vi.mock("@/components/LiveDashboard/Reporting/TradesTableSection", () => ({
  TradesTableSection: ({
    history,
  }: {
    history: SlowTradingDashboardState["history"];
  }) => (
    <div data-testid="history-table">
      {history.map((trade) => trade.symbol).join(",")}
    </div>
  ),
}));

describe("trade history views", () => {
  it("keeps the full report in all view and reuses the table for losses", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const history = [
      {
        ...createTestPosition({
          symbol: "WIN",
          netPct: 1,
          netUsdt: 2,
          notes: "Winning note.",
          closed: {
            feeUsdt: 0,
            price: 11,
            reason: "TAKE_PROFIT",
            t: 1,
          },
        }),
        mode: "sandbox",
      },
      {
        ...createTestPosition({
          symbol: "LOSS",
          netPct: -1,
          netUsdt: -2,
          notes: "First loss note.",
          closed: {
            feeUsdt: 0,
            price: 9,
            reason: "STOP_LOSS",
            t: 2,
          },
        }),
        mode: "sandbox",
      },
      {
        ...createTestPosition({
          symbol: "LOSS",
          netPct: -2,
          netUsdt: -3,
          notes: "Second loss note.",
          closed: {
            feeUsdt: 0,
            price: 8,
            reason: "STOP_LOSS",
            t: 3,
          },
        }),
        mode: "sandbox",
      },
      {
        ...createTestPosition({
          symbol: "ALT",
          netPct: -0.5,
          netUsdt: -1,
          closed: {
            feeUsdt: 0,
            price: 9,
            reason: "MANUAL",
            t: 4,
          },
        }),
        mode: "sandbox",
      },
      { ...createTestPosition({ symbol: "FLAT", netPct: 0, netUsdt: 0 }), mode: "sandbox" },
    ] as SlowTradingDashboardState["history"];
    const dashboardState = {
      activeMode: "sandbox",
      balances: { startingBalanceUSDT: 100 },
      config: {
        exchangeType: "binance",
        modelConfig: { takeProfitPercent: 2 },
        watchReservePctAlloc: 2,
      },
      history,
    } as SlowTradingDashboardState;

    render(
      <SnackbarProvider>
        <SlowTradingReporting dashboardState={dashboardState} />
      </SnackbarProvider>,
    );

    expect(screen.getByTestId("history-charts")).toBeTruthy();
    expect(screen.getByTestId("max-up-distribution")).toBeTruthy();
    expect(screen.getByTestId("history-summary")).toBeTruthy();
    expect(screen.getByTestId("history-table").textContent).toBe(
      "WIN,LOSS,LOSS,ALT,FLAT",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Loss evaluation" }));

    expect(screen.queryByTestId("history-charts")).toBeNull();
    expect(screen.queryByTestId("max-up-distribution")).toBeNull();
    expect(screen.queryByTestId("history-summary")).toBeNull();
    expect(screen.getByTestId("history-table").textContent).toBe(
      "LOSS,LOSS,ALT",
    );
    expect(screen.getByTestId("loss-notes").textContent).toBe(
      "LOSS: First loss note.\n\nLOSS: Second loss note.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy all loss notes" }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "LOSS: First loss note.\n\nLOSS: Second loss note.",
      );
    });
    expect(
      screen.getByLabelText("Loss count by coin counts").textContent,
    ).toContain("LOSS 2");
    expect(
      screen.getByLabelText("Loss count by coin counts").textContent,
    ).toContain("ALT 1");
    expect(
      screen.getByLabelText("Loss count by exit reason counts").textContent,
    ).toContain("STOP LOSS 2");
    expect(
      screen.getByLabelText("Loss count by exit reason counts").textContent,
    ).toContain("MANUAL 1");
    expect(screen.queryByText("WIN: Winning note.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete All Trade History" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Profit evaluation" }));

    expect(screen.queryByTestId("history-charts")).toBeNull();
    expect(screen.queryByTestId("history-summary")).toBeNull();
    expect(screen.getByTestId("history-table").textContent).toBe("WIN");
    expect(screen.getByTestId("profit-notes").textContent).toBe(
      "WIN: Winning note.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy all profit notes" }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith("WIN: Winning note.");
    });
    expect(
      screen.getByLabelText("Profit count by coin counts").textContent,
    ).toContain("WIN 1");
    expect(
      screen.getByLabelText("Profit count by exit reason counts").textContent,
    ).toContain("TAKE PROFIT 1");
    expect(screen.queryByText("LOSS: First loss note.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "All view" }));

    expect(screen.getByTestId("history-charts")).toBeTruthy();
    expect(screen.getByTestId("history-summary")).toBeTruthy();
    expect(screen.getByTestId("history-table").textContent).toBe(
      "WIN,LOSS,LOSS,ALT,FLAT",
    );
  });
});
