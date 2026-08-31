/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import NavbarBalanceSummary from "@/components/LiveDashboard/Navbar/NavbarBalanceSummary";
import type { BalanceSummary } from "@/components/LiveDashboard/Navbar/types";

const STORAGE_KEY = "slow-trading:navbar:balance-visible:v1";

const balanceSummary: BalanceSummary = {
  available: 153.44,
  locked: 16.94,
  reserved: 135.57,
  safeHaven: 0,
  spendable: 17.87,
  startingBalance: 1_000,
  total: 170.38,
};

describe("NavbarBalanceSummary", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("hides balances by default and remembers when the user shows them", async () => {
    const user = userEvent.setup();

    render(<NavbarBalanceSummary balanceSummary={balanceSummary} />);

    // PROD:NAVBAR_BALANCE_PRIVACY
    expect(screen.getByText("*****")).toBeDefined();
    expect(screen.getByText("A: *****")).toBeDefined();
    expect(screen.getByText("S: *****")).toBeDefined();
    expect(screen.getByText("R: *****")).toBeDefined();
    expect(screen.getByText("L: *****")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show balance numbers" }))
      .toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Show balance numbers" }),
    );

    expect(screen.getByText("$170.38")).toBeDefined();
    expect(screen.getByText("A: $153.44")).toBeDefined();
    expect(screen.getByText("S: $17.87")).toBeDefined();
    expect(screen.getByText("R: $135.57")).toBeDefined();
    expect(screen.getByText("L: $16.94")).toBeDefined();
    expect(
      screen.queryByText((content) => content.startsWith("H:")),
    ).toBeNull();

    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    });
    expect(screen.getByRole("button", { name: "Hide balance numbers" }))
      .toBeDefined();
  });

  it("starts visible when local storage remembers visible balances", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");

    render(<NavbarBalanceSummary balanceSummary={balanceSummary} />);

    // PROD:NAVBAR_BALANCE_PRIVACY
    expect(screen.getByText("$170.38")).toBeDefined();
    expect(screen.getByRole("button", { name: "Hide balance numbers" }))
      .toBeDefined();
  });

  it("keeps resolved tooltip equations hidden with private balances", async () => {
    const user = userEvent.setup();

    render(<NavbarBalanceSummary balanceSummary={balanceSummary} />);

    await user.hover(screen.getByText("A: *****"));

    expect(
      await screen.findByText(
        "balance.available = spendable + reserved + safeHaven",
      ),
    ).toBeDefined();
    expect(
      screen.queryByText("$153.44 = $17.87 + $135.57 + $0.00"),
    ).toBeNull();
  });

  it("shows resolved numeric equations when balances are visible", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, "true");

    render(<NavbarBalanceSummary balanceSummary={balanceSummary} />);

    await user.hover(screen.getByText("A: $153.44"));
    expect(
      await screen.findByText("$153.44 = $17.87 + $135.57 + $0.00"),
    ).toBeDefined();

    await user.unhover(screen.getByText("A: $153.44"));
    await user.hover(screen.getByText("$170.38"));
    expect(
      await screen.findByText("$170.38 = $153.44 + $16.94"),
    ).toBeDefined();
  });
});
