/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { SnackbarProvider } from "notistack";
import { describe, expect, it, vi } from "vitest";

import { TradesTableSection } from "@/components/LiveDashboard/Reporting/TradesTableSection";
import { createTestPosition } from "../fixtures/position";

vi.mock(
  "@/components/LiveDashboard/Shared/NetProfitPercentHistorySparkline",
  () => ({
    NetProfitPercentHistorySparkline: () => (
      <div data-testid="pnl-history-chart" />
    ),
  }),
);

describe("trade-history level sequence", () => {
  it("shows the persisted entry, averaging, and exit path below the PnL chart", () => {
    const position = createTestPosition({
      averaging: {
        entryLevel: -2,
        executions: [
          {
            allocationPct: 2,
            level: -4,
            marginUsdt: 40,
            price: 8,
            t: 250,
          },
          {
            allocationPct: 5,
            level: -3,
            marginUsdt: 20,
            price: 9,
            t: 200,
          },
        ],
        lastHandledLevel: -3,
        reserveBaseMarginUsdt: 10,
        reservedRemainingMarginUsdt: 0,
        steps: [
          {
            allocationPct: 5,
            level: -3,
            marginUsdt: 20,
            status: "USED",
          },
        ],
      },
      closed: {
        feeUsdt: 0,
        message: "[EXIT] Target reached",
        price: 11,
        reason: "TAKE_PROFIT",
        t: 300,
        vPoint: { id: "T_EXIT", lvl: 0 },
      },
      entryLevel: -2,
      entryTime: 100,
      pnl: {
        history: [
          { pct: 0, t: 100 },
          { pct: 10, t: 300 },
        ],
        netPct: 10,
        netUsdt: 1,
        maxUpUsdt: 4.25,
        maxDownUsdt: -3.5,
      },
      symbol: "SUI",
    });

    render(
      <SnackbarProvider>
        <TradesTableSection
          exchangeType="binance"
          history={[{ ...position, mode: "sandbox" }]}
          mode="sandbox"
          onHistoryChange={vi.fn()}
          readOnly
          reserveMultiplier={2}
        />
      </SnackbarProvider>,
    );

    // BOTH:REUSABLE_LEVEL_SEQUENCE
    const pnlCell = screen.getByLabelText(
      "PnL history and level sequence for SUI",
    );
    const chart = within(pnlCell).getByTestId("pnl-history-chart");
    const sequence = within(pnlCell).getByLabelText("Position level sequence");

    expect(
      within(sequence)
        .getAllByText(/^L/)
        .map((chip) => chip.textContent),
    ).toEqual(["L2", "L3 AVG 5x", "L4 AVG 2x", "L0 EXIT"]);
    expect(chart.nextElementSibling?.contains(sequence)).toBe(true);
    // BOTH:POSITION_PNL_USDT_EXTREMA
    expect(screen.getByText("Max Up USD")).toBeTruthy();
    expect(screen.getByText("Max Down USD")).toBeTruthy();
    expect(screen.getByText("$+4.25")).toBeTruthy();
    expect(screen.getByText("$-3.50")).toBeTruthy();
    expect(screen.queryByText("sandbox")).toBeNull();
  });

  it("shows persisted levels that were reached without averaging", () => {
    const position = createTestPosition({
      averaging: {
        entryLevel: -2,
        executions: [
          {
            allocationPct: 2,
            level: -4,
            marginUsdt: 40,
            price: 8,
            t: 250,
          },
        ],
        lastHandledLevel: -4,
        reserveBaseMarginUsdt: 10,
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
      closed: {
        feeUsdt: 0,
        message: "[EXIT] Closed",
        price: 11,
        reason: "TAKE_PROFIT",
        t: 300,
        vPoint: { id: "T_EXIT", lvl: 0 },
      },
      entryId: "B_ENTRY",
      entryLevel: -2,
      symbol: "SUI",
      vPoints: [
        { id: "B_NOT_AVERAGED", lvl: -3 },
        { id: "B_AVERAGED", lvl: -4 },
      ],
    });

    render(
      <SnackbarProvider>
        <TradesTableSection
          exchangeType="binance"
          history={[{ ...position, mode: "sandbox" }]}
          mode="sandbox"
          onHistoryChange={vi.fn()}
          readOnly
          reserveMultiplier={2}
        />
      </SnackbarProvider>,
    );

    // BOTH:POSITION_VPOINT_PATH
    const sequence = screen.getByLabelText("Position level sequence");
    expect(
      within(sequence)
        .getAllByText(/^L/)
        .map((chip) => chip.textContent),
    ).toEqual(["L2", "L3 NOT AVG", "L4 AVG 2x", "L0 EXIT"]);
  });
});
