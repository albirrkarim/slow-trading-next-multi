/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OpenPositions from "@/components/LiveDashboard/Feature/OpenPositions";
import openPositionPnlContribution from "@/components/LiveDashboard/Feature/open-position-pnl-contribution";
import { createTestPosition } from "../fixtures/position";

vi.mock("@/components/LiveDashboard/Feature/OpenPositionItem", () => ({
  default: ({
    pnlContributionShare,
    position,
  }: {
    pnlContributionShare: number;
    position: { symbol: string };
  }) => (
    <div
      data-contribution-share={pnlContributionShare}
      data-testid="open-position"
    >
      {position.symbol}
    </div>
  ),
}));

function renderedSymbols() {
  return screen
    .getAllByTestId("open-position")
    .map((item) => item.textContent);
}

describe("OpenPositions PnL sorting", () => {
  it("starts worst-first and toggles to best-first", () => {
    render(
      <OpenPositions
        availableTags={[]}
        coinDescriptions={{}}
        coinTags={{}}
        config={{} as any}
        exchangeType={"okx" as any}
        mode="sandbox"
        onCoinDescriptionChange={vi.fn()}
        onCoinTagsChange={vi.fn()}
        positions={
          [
            { ...createTestPosition({
              netPct: -1,
              netUsdt: -2,
              symbol: "MID",
            }), mode: "sandbox" as const },
            { ...createTestPosition({
              netPct: 2,
              netUsdt: 3,
              symbol: "BEST",
            }), mode: "sandbox" as const },
            { ...createTestPosition({
              netPct: -4.2,
              netUsdt: -5,
              symbol: "WORST",
            }), mode: "sandbox" as const },
          ]
        }
        spendableQuoteAsset={0}
        tagColors={{}}
        tagDescriptions={{}}
        volatilityMap={{}}
        volume24hBySymbol={{}}
      />,
    );

    expect(renderedSymbols()).toEqual(["WORST", "MID", "BEST"]);
    expect(
      screen
        .getAllByTestId("open-position")
        .map((item) => Number(item.dataset.contributionShare)),
    ).toEqual([0.5, 0.2, 0.3]);

    fireEvent.click(screen.getByLabelText("Sort PnL best first"));

    expect(renderedSymbols()).toEqual(["BEST", "MID", "WORST"]);
    expect(screen.getByLabelText("Sort PnL worst first")).toBeTruthy();
  });

  it("calculates restrained contribution intensity", () => {
    expect(
      openPositionPnlContribution.totalAbsolute([
        { pnl: { netUsdt: -2 } },
        { pnl: { netUsdt: 3 } },
        { pnl: { netUsdt: Number.NaN } },
      ]),
    ).toBe(5);
    expect(openPositionPnlContribution.share(-2, 5)).toBe(0.4);
    expect(openPositionPnlContribution.share(2, 0)).toBe(0);
    expect(openPositionPnlContribution.opacity(0)).toBe(0);
    expect(openPositionPnlContribution.opacity(0.01)).toBeLessThan(
      openPositionPnlContribution.opacity(0.5),
    );
    expect(openPositionPnlContribution.opacity(1)).toBe(0.18);
  });
});
