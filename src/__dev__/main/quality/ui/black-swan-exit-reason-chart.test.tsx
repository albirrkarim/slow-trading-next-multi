/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import BlackSwanExitReasonChart from "@/components/LiveDashboard/Navbar/BlackSwanExitReasonChart";
import type { BlackSwanSavingsPositionResult } from "@/lib/devBacktest/black-swan";
import { describe, expect, it } from "vitest";

function position(
  protectedExitReason: BlackSwanSavingsPositionResult["protectedExitReason"],
): BlackSwanSavingsPositionResult {
  return { protectedExitReason } as BlackSwanSavingsPositionResult;
}

describe("Black Swan exit reason chart", () => {
  // BTEST:BLACK_SWAN_EXIT_REASON_CHART
  it("shows each actual exit reason as a compact count chip", () => {
    render(
      <BlackSwanExitReasonChart
        positions={[
          position("BLACK_SWAN_CRISIS"),
          position("BLACK_SWAN_CRISIS"),
          position("LIQUIDATED"),
        ]}
      />,
    );

    expect(screen.getByText("BLACK_SWAN_CRISIS[2]")).toBeTruthy();
    expect(screen.getByText("LIQUIDATED[1]")).toBeTruthy();
  });
});
