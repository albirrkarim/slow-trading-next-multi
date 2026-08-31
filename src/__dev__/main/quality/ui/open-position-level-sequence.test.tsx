/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OpenPositionLevelSequence, {
  buildOpenPositionLevelSequence,
} from "@/components/LiveDashboard/Feature/OpenPositionLevelSequence";

const watchState = {
  executions: [{ allocationPct: 5, level: -3 }],
  steps: [
    { level: -3, marginUsdt: 10, status: "USED" as const },
    { level: -4, marginUsdt: 20, status: "RESERVED" as const },
    { level: -5, marginUsdt: 40, status: "UNRESERVED" as const },
  ],
};

describe("OpenPositionLevelSequence", () => {
  it("classifies entry, current averaged, reserved, and unreserved levels", () => {
    const items = buildOpenPositionLevelSequence({
      currentLevel: -3,
      entryLevel: -2,
      spendableQuoteAsset: 39.99,
      watchState,
    });

    expect(
      items.map(({ isAveraged, level, state, unreservedCoverage }) => ({
        isAveraged,
        level: Math.abs(level),
        state,
        unreservedCoverage,
      })),
    ).toEqual([
      {
        isAveraged: false,
        level: 2,
        state: "passed",
        unreservedCoverage: undefined,
      },
      {
        isAveraged: true,
        level: 3,
        state: "current",
        unreservedCoverage: undefined,
      },
      {
        isAveraged: false,
        level: 4,
        state: "reserved",
        unreservedCoverage: undefined,
      },
      {
        isAveraged: false,
        level: 5,
        state: "unreserved",
        unreservedCoverage: "partial",
      },
    ]);
  });

  it("shows the actual multiplier for every averaged level", () => {
    render(
      <OpenPositionLevelSequence
        currentLevel={-3}
        entryLevel={-1}
        reserveMultiplier={2}
        spendableQuoteAsset={100}
        watchState={{
          executions: [
            { allocationPct: 2, level: -2 },
            { allocationPct: 5, level: -3 },
          ],
          steps: [
            { level: -2, marginUsdt: 20, status: "USED" },
            { level: -3, marginUsdt: 50, status: "USED" },
          ],
        }}
      />,
    );

    expect(screen.getByText("L2 AVG 2x")).toBeTruthy();
    expect(screen.getByText("L3 AVG 5x")).toBeTruthy();
  });

  it("colors a reached current level as warning until averaging executes", async () => {
    render(
      <OpenPositionLevelSequence
        currentLevel={-4}
        direction="LONG"
        entryLevel={-3}
        entryTime={100}
        markPrice={90}
        spendableQuoteAsset={100}
        volatilityPoints={[
          {
            id: "current-level",
            l: "B",
            lvl: -4,
            p: 80,
            pct: 5,
            t: 200,
            vb: 1,
            vq: 1,
          } as any,
        ]}
        watchState={{
          steps: [
            { level: -4, marginUsdt: 20, status: "RESERVED" },
            { level: -5, marginUsdt: 40, status: "UNRESERVED" },
          ],
        }}
      />,
    );

    const reachedStep = screen.getByLabelText(
      "Level 4, Current, Not averaged, Drift +12.50%",
    );

    expect(reachedStep.className).toContain("MuiChip-colorWarning");
    expect(reachedStep.textContent).toBe("L4 drift +12.50%");
    fireEvent.mouseOver(reachedStep);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "Profit-direction drift +12.50% from the current level vPoint to mark price",
    );
  });

  it("colors and describes sequential unreserved coverage states", async () => {
    const sequentialWatchState = {
      steps: [
        { level: -3, marginUsdt: 11.947, status: "RESERVED" as const },
        { level: -4, marginUsdt: 35.841, status: "UNRESERVED" as const },
        { level: -5, marginUsdt: 107.523, status: "UNRESERVED" as const },
        { level: -6, marginUsdt: 10, status: "UNRESERVED" as const },
      ],
    };

    render(
      <OpenPositionLevelSequence
        currentLevel={-2}
        entryLevel={-2}
        spendableQuoteAsset={134.66}
        watchState={sequentialWatchState}
      />,
    );

    const currentStep = screen.getByLabelText("Level 2, Current, Entry");
    const reservedStep = screen.getByLabelText("Level 3, Reserved");
    const fullyCoveredStep = screen.getByLabelText(
      "Level 4, Unreserved, Fully covered",
    );
    const partiallyCoveredStep = screen.getByLabelText(
      "Level 5, Unreserved, Partially covered",
    );
    const uncoveredStep = screen.getByLabelText(
      "Level 6, Unreserved, Not covered",
    );

    expect(currentStep.className).toContain("MuiChip-colorPrimary");
    expect(reservedStep.className).toContain("MuiChip-colorSuccess");
    expect(fullyCoveredStep.className).toContain("MuiChip-colorSuccess");
    expect(partiallyCoveredStep.className).toContain("MuiChip-colorWarning");
    expect(uncoveredStep.className).toContain("MuiChip-colorDefault");
    expect(window.getComputedStyle(reservedStep).borderStyle).toBe("solid");
    expect(window.getComputedStyle(fullyCoveredStep).borderStyle).toBe(
      "dashed",
    );

    fireEvent.mouseOver(partiallyCoveredStep);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "Coverage 91.9% ($98.82 of $107.52)",
    );
  });

  it("shows the broken averaging path through the latest vPoint", () => {
    const targetHitWatchState = {
      steps: [
        { level: 2, marginUsdt: 6, status: "RESERVED" as const },
        { level: 3, marginUsdt: 12, status: "UNRESERVED" as const },
        { level: 4, marginUsdt: 24, status: "UNRESERVED" as const },
      ],
    };
    const volatilityPoints = [
      { id: "entry", l: "T", lvl: 1, p: 2.2, pct: 2, t: 100, vb: 1, vq: 1 },
      { id: "adverse", l: "T", lvl: 2, p: 2.37, pct: 7, t: 200, vb: 1, vq: 1 },
      { id: "target", l: "B", lvl: -1, p: 2.27, pct: 4, t: 300, vb: 1, vq: 1 },
      { id: "rebound", l: "T", lvl: 1, p: 2.33, pct: 2, t: 400, vb: 1, vq: 1 },
      { id: "latest", l: "B", lvl: 0, p: 2.28, pct: 2, t: 500, vb: 1, vq: 1 },
    ] as any;

    const items = buildOpenPositionLevelSequence({
      currentLevel: 0,
      direction: "SHORT",
      entryLevel: 1,
      entryTime: 100,
      spendableQuoteAsset: 100,
      volatilityPoints,
      watchState: targetHitWatchState,
    });

    // BOTH:VOLATILITY_TARGET_TP
    expect(
      items.map(({ isAveraged, level, state }) => ({
        isAveraged,
        level: Math.abs(level),
        state,
      })),
    ).toEqual([
      { isAveraged: false, level: 1, state: "passed" },
      { isAveraged: false, level: 2, state: "skipped" },
      { isAveraged: false, level: 0, state: "target" },
      { isAveraged: false, level: 1, state: "passed" },
      { isAveraged: false, level: 0, state: "current" },
    ]);

    render(
      <OpenPositionLevelSequence
        currentLevel={0}
        direction="SHORT"
        entryLevel={1}
        entryTime={100}
        spendableQuoteAsset={100}
        volatilityPoints={volatilityPoints}
        watchState={targetHitWatchState}
      />,
    );

    expect(screen.getByText("L2 NOT AVG")).toBeTruthy();
    expect(screen.queryByText("L3")).toBeNull();
    expect(screen.queryByText("L4")).toBeNull();
    expect(screen.getAllByText("L1")).toHaveLength(2);
    expect(screen.getAllByText("L0")).toHaveLength(2);
    expect(
      screen.getByLabelText("Level 0, Target vPoint hit").className,
    ).toContain("MuiChip-colorError");
    expect(
      screen.getByLabelText("Level 0, Current").className,
    ).toContain("MuiChip-colorPrimary");
    expect(screen.getByLabelText("Averaging sequence stopped").textContent).toContain(
      "Target vPoint hit; remaining averaging steps stopped",
    );
  });
});
