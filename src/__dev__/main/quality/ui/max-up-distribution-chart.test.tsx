/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import MaxUpDistributionChart from "@/components/LiveDashboard/Reporting/MaxUpDistributionChart";
import type { SlowTradingReportRow } from "@/components/LiveDashboard/Reporting/types";
import { createTestPosition } from "../fixtures/position";

describe("Max Up distribution chart", () => {
  beforeEach(() => window.localStorage.clear());

  it("stays collapsed while editing and applies the selected interval", () => {
    const history = [
      createTestPosition({ pnl: { maxUpPct: 0.4 } }),
      createTestPosition({ pnl: { maxUpPct: 1.2 } }),
    ] as SlowTradingReportRow[];

    render(<MaxUpDistributionChart history={history} takeProfitPct={2} />);

    const intervalInput = screen.getByLabelText("Interval %");
    fireEvent.click(intervalInput);
    expect(screen.queryByLabelText(/Max Up distribution chart/)).toBeNull();

    fireEvent.change(intervalInput, { target: { value: "1" } });
    fireEvent.click(screen.getByText("Max Up % Distribution"));

    expect(
      screen.getByLabelText("Max Up distribution chart, 1% interval"),
    ).toBeTruthy();
  });
});
