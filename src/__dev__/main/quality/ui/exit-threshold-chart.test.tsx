/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExitThresholdChart, {
  buildExitThresholdChartModel,
} from "@/components/LiveDashboard/Navbar/ExitThresholdChart";

describe("ExitThresholdChart", () => {
  it("builds the StopLoss+ path from percentage ratios", () => {
    expect(
      buildExitThresholdChartModel({
        stopLossPct: 15,
        stopLossPlusEnabled: true,
        takeProfitPct: 2,
        targetZoneStopLossPct: 2,
        triggerPct: 1,
      }),
    ).toMatchObject({
      activationPct: 2,
      data: [
        { event: "Entry", minimumPnlPct: null, pnlPct: 0 },
        { event: "TP + Active", minimumPnlPct: 2, pnlPct: 2 },
        { event: "Initial min", minimumPnlPct: 1, pnlPct: null },
        { event: "Peak", minimumPnlPct: null, pnlPct: 3 },
        { event: "SL+ exit", minimumPnlPct: null, pnlPct: 2 },
      ],
      hardStopPct: -15,
      minimumExitPct: 1,
      peakPct: 3,
      takeProfitPct: 2,
      targetZoneStopPct: -2,
      triggerPct: 1,
    });
  });

  it("renders the configured exit thresholds", () => {
    render(
      <ExitThresholdChart
        stopLossPct={15}
        stopLossPlusEnabled
        takeProfitPct={2}
        targetZoneStopLossPct={2}
        triggerPct={1}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Exit threshold chart" }),
    ).toBeDefined();
    expect(screen.getByText("TP target")).toBeDefined();
    expect(screen.getByText("Hard SL")).toBeDefined();
    expect(screen.getByText("-15%")).toBeDefined();
    expect(screen.getByText("SL+ retrace")).toBeDefined();
    expect(screen.getByText("SL+ minimum")).toBeDefined();
    expect(screen.getByText("Target-zone SL")).toBeDefined();
    expect(
      within(screen.getByTestId("threshold-target-zone-stop")).getByText(
        "-2%",
      ),
    ).toBeDefined();
    expect(
      within(screen.getByTestId("threshold-stop-loss-plus-active")).getByText(
        "+2%",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Target-zone SL becomes active only after LONG reaches a TOP or SHORT reaches a BOTTOM following entry.",
      ),
    ).toBeDefined();
    expect(
      within(
        screen.getByTestId("threshold-stop-loss-plus-minimum"),
      ).getByText("+1%"),
    ).toBeDefined();
    expect(
      within(
        screen.getByTestId("threshold-stop-loss-plus-retrace"),
      ).getByText("1%"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Minimum: +2% TP - 1% retrace = +1%. Example after a +3% peak: exit near +2%. Execution timing and slippage can vary the realized fill.",
      ),
    ).toBeDefined();
  });
});
