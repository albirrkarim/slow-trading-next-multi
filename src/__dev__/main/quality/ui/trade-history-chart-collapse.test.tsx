/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ChartsSection } from "@/components/LiveDashboard/Reporting/ChartsSection";

describe("trade-history chart collapse", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts collapsed and remembers expansion", () => {
    const props = { history: [], startingBalanceUSDT: 1000 };
    const first = render(<ChartsSection {...props} />);

    // PROD:TRADE_HISTORY_CHART_COLLAPSE
    expect(
      screen.queryByLabelText("Trades / Wins / Losses Over Time chart"),
    ).toBeNull();

    fireEvent.click(screen.getByText("Trades / Wins / Losses Over Time"));
    expect(
      screen.getByLabelText("Trades / Wins / Losses Over Time chart"),
    ).not.toBeNull();

    first.unmount();
    render(<ChartsSection {...props} />);
    expect(
      screen.getByLabelText("Trades / Wins / Losses Over Time chart"),
    ).not.toBeNull();
  });
});
