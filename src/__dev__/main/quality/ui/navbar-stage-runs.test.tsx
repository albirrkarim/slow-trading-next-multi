/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NavbarStageRuns from "@/components/LiveDashboard/Navbar/NavbarStageRuns";

describe("navbar production stage runs", () => {
  it("shows all stages and expands only the selected timing breakdown", async () => {
    const speedupRunAt = Date.UTC(2026, 7, 1, 3, 24);

    render(
      <NavbarStageRuns
        dashboardState={
          {
            stats: {
              lastRunAt: speedupRunAt,
              lastRunDurationMs: 2_000,
              stageRuns: {
                speedup: {
                  t: speedupRunAt,
                  ms: 2_000,
                  symbols: 1,
                  reports: 0,
                  summary:
                    "sandbox speedup cycle finished with 0 report(s)",
                  performance: {
                    totalMs: 2_000,
                    sections: [
                      { s: "cycle.latestPrices", ms: 1_500, n: 1 },
                    ],
                  },
                },
                "standard-monitoring": {
                  t: speedupRunAt - 60_000,
                  ms: 1_000,
                  symbols: 2,
                  reports: 1,
                  summary:
                    "sandbox standard-monitoring cycle finished with 1 report(s)",
                  performance: {
                    totalMs: 1_000,
                    sections: [
                      { s: "cycle.reportingSync", ms: 500, n: 1 },
                    ],
                  },
                },
              },
              closedTrades: 0,
              openPositions: 0,
            },
          } as any
        }
      />,
    );

    fireEvent.mouseOver(screen.getByText(/Last run:/));

    // PROD:STAGE_RUN_STATS
    expect(
      await screen.findByRole("table", { name: "Scheduled stage runs" }),
    ).toBeTruthy();
    expect(screen.getByText("Speedup")).toBeTruthy();
    expect(screen.getByText("Risk Sentinel")).toBeTruthy();
    expect(screen.getByText("Standard Monitoring")).toBeTruthy();
    expect(screen.getByText("Management")).toBeTruthy();
    expect(screen.getByText("Capture Entry")).toBeTruthy();
    expect(screen.getByText("0 reports / 1 coin")).toBeTruthy();
    expect(screen.getByText("1 report / 2 coins")).toBeTruthy();
    expect(screen.queryByText("latest prices")).toBeNull();
    expect(
      window.getComputedStyle(screen.getByText("Stage").closest("th")!).color,
    ).toBe("rgb(255, 255, 255)");

    fireEvent.click(
      screen.getByRole("button", { name: "Show Speedup performance" }),
    );

    expect(
      await screen.findByRole("table", {
        name: "Stage performance breakdown",
      }),
    ).toBeTruthy();
    expect(screen.getByText("latest prices")).toBeTruthy();
    expect(screen.queryByText("reporting sync")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Hide Speedup performance" }),
    ).toBeTruthy();
  });
});
