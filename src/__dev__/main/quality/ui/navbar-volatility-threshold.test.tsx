/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NavbarVolatilityThreshold from "@/components/LiveDashboard/Navbar/NavbarVolatilityThreshold";

describe("NavbarVolatilityThreshold", () => {
  it("shows the server-resolved global volatility threshold", () => {
    render(<NavbarVolatilityThreshold volatilityThresholdPct={2} />);

    // PROD:GLOBAL_VOLATILITY_THRESHOLD
    expect(screen.getByText("Vol: 2%")).toBeDefined();
    expect(
      screen.getByLabelText("Global volatility threshold: 2%"),
    ).toBeDefined();
  });
});
