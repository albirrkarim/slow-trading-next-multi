/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import SystemAccountSummary from "@/components/LiveDashboard/SystemAccountSummary";
import { getCustomAccountTradingConfig } from "@/components/LiveDashboard/account-trading-summary";
import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic/constants";
import slowTradingAccountConfig from "@/lib/slowTrading/account-config";

function makeTradingConfig() {
  return slowTradingAccountConfig.trading.fromEffectiveConfig(
    DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  );
}

describe("per-account trading configuration summary", () => {
  it("recursively keeps only values that differ from production defaults", () => {
    const trading = makeTradingConfig();
    trading.notes = "Small positions with fast exits.";
    trading.maxOpenPositions = 6;
    trading.maxEntryMarginPct = 0;
    trading.exitSidewaysToFreeWorkersForStrongCandidates = true;
    trading.adaptiveAveraging = {
      ...trading.adaptiveAveraging!,
      enabled: false,
    };
    trading.modelConfig = {
      ...trading.modelConfig,
      takeProfitPercent: 1.1,
    };

    expect(getCustomAccountTradingConfig(trading)).toEqual({
      adaptiveAveraging: { enabled: false },
      exitSidewaysToFreeWorkersForStrongCandidates: true,
      maxOpenPositions: 6,
      modelConfig: { takeProfitPercent: 1.1 },
    });
  });

  it("renders enabled-account notes and collapsible custom values", async () => {
    const user = userEvent.setup();
    const mainTrading = makeTradingConfig();
    mainTrading.notes = "Main account notes";
    mainTrading.maxOpenPositions = 4;
    const secondTrading = makeTradingConfig();

    // PROD:MULTI_ACCOUNT_TRADING_CONFIG_SUMMARY
    render(
      <SystemAccountSummary
        accounts={[
          {
            enabled: true,
            name: "Main",
            slug: "main",
            trading: mainTrading,
          },
          {
            enabled: false,
            name: "Second",
            slug: "second",
            trading: secondTrading,
          },
        ]}
        description="Overall system description"
      />,
    );

    expect(screen.getByText("Overall system description")).toBeTruthy();
    expect(screen.getByText("Main account notes")).toBeTruthy();
    expect(screen.queryByText("Account configuration summary")).toBeNull();
    expect(screen.queryByText("Second")).toBeNull();
    expect(screen.queryByTestId("account-config-summary-second")).toBeNull();

    const mainSummary = screen.getByTestId("account-config-summary-main");
    expect(
      screen.queryByTestId("account-config-overrides-main"),
    ).toBeNull();

    await user.click(within(mainSummary).getByRole("button"));

    const mainOverrides = screen.getByTestId("account-config-overrides-main");
    expect(within(mainOverrides).getByText(/"maxOpenPositions": 4/)).toBeTruthy();
    expect(mainOverrides.textContent).not.toContain("exactLeverage");
  });
});
