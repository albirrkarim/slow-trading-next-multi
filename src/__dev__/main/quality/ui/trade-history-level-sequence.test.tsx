/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("shows the last monitoring stage and the Standard classification reason", () => {
    const position = createTestPosition({ symbol: "SUI" });
    position.lastMonitoringStage = {
      stage: "standard",
      lastUpdated: 200,
      reason:
        "No Speedup rule matched: canonical net PnL 0.2%; PnL rules require >= +1.5% or <= -1.5%",
    };

    render(
      <SnackbarProvider>
        <TradesTableSection
          exchangeType="binance"
          history={[{ ...position, mode: "sandbox" }]}
          mode="sandbox"
          onHistoryChange={vi.fn()}
          readOnly
        />
      </SnackbarProvider>,
    );

    // PROD:MONITORING_OPEN_POSITION
    expect(screen.getByText("Last stage: standard")).toBeTruthy();
    expect(
      screen.getByText(
        "Reason: No Speedup rule matched: canonical net PnL 0.2%; PnL rules require >= +1.5% or <= -1.5%",
      ),
    ).toBeTruthy();
  });

  it("shows the persisted entry, averaging, and exit path below the PnL chart", async () => {
    const position = createTestPosition({
      averaging: {
        entryLevel: -2,
        executions: [
          {
            allocationPct: 2,
            level: -4,
            marginUsdt: 40,
            monitoringState: {
              lastUpdated: 250,
              reason: "No Speedup rule matched",
              stage: "standard",
            },
            price: 8,
            t: 250,
          },
          {
            allocationPct: 5,
            level: -3,
            marginUsdt: 20,
            monitoringState: {
              lastUpdated: 200,
              reason: "negative PnL threshold",
              stage: "speedup",
            },
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
        vPoint: { id: "B_EXIT", lvl: -4 },
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
      vPoints: [{ id: "B_AVERAGED_3", lvl: -3 }],
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
    ).toEqual(["L2", "L3 AVG 5x", "L4 AVG 2x EXIT"]);
    // PROD:AVERAGING_MONITORING_STATE_SNAPSHOT
    const speedupState = within(sequence).getByLabelText(
      "Speedup monitoring state at averaging level 3",
    );
    expect(
      within(sequence).getByLabelText(
        "Standard monitoring state at averaging level 4",
      ),
    ).toBeTruthy();
    fireEvent.mouseOver(speedupState);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "negative PnL threshold",
    );
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
