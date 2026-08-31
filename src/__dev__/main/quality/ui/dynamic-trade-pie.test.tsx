/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AssetPieChart from "@/components/dev/DynamicTrade/Debug/Pie";

describe("dynamic-trade pie chart", () => {
  it("shows outcome chips for every coin, including one without profits", () => {
    render(
      <AssetPieChart
        ariaLabel="Profit count by coin pie chart"
        dataObject={{ BTC: 1, ETH: 1, SOL: 0 }}
        outcomeStats={{
          BTC: { losses: 1, wins: 1 },
          ETH: { losses: 0, wins: 1 },
          SOL: { losses: 1, wins: 0 },
        }}
      />,
    );

    expect(screen.getByText("BTC w:1 l:1 | wr:50.0%")).toBeTruthy();
    expect(screen.getByText("ETH w:1 l:0 | wr:100.0%")).toBeTruthy();
    expect(screen.getByText("SOL w:0 l:1 | wr:0.0%")).toBeTruthy();
  });
});
