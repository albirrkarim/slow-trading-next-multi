/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import BlackSwanStatusSection from "@/components/LiveDashboard/BlackSwanStatusSection";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post: mocks.post,
  },
}));

function makeState(
  blackSwan: SlowTradingDashboardState["blackSwan"],
): SlowTradingDashboardState {
  return {
    activeMode: "live",
    blackSwan,
    config: {
      blackSwan: {
        recoveryCooldownMinutes: 60,
      },
    },
    runtime: {
      blackSwanStageIntervalMinutes: 1,
    },
  } as SlowTradingDashboardState;
}

describe("BlackSwanStatusSection", () => {
  it("shows normal decisions instead of hiding the monitor", () => {
    render(
      <BlackSwanStatusSection
        onRefresh={vi.fn()}
        state={makeState({
          reason: "HEALTHY",
          since: Date.now() - 120_000,
          status: "NORMAL",
          t: Date.now(),
        })}
      />,
    );

    // PROD:BLACK_SWAN_RISK_SENTINEL
    expect(screen.getByRole("region", { name: "Live Black Swan decision" }))
      .toBeDefined();
    expect(screen.getByText("NORMAL")).toBeDefined();
    expect(screen.getByText("Trading is operating normally")).toBeDefined();
    expect(
      screen.getByText(/BTC and market breadth are within/),
    ).toBeDefined();
    expect(screen.getByText("State since")).toBeDefined();
    expect(screen.getByText("Last evaluated")).toBeDefined();
    expect(screen.getByText("Evaluation cadence")).toBeDefined();
    expect(screen.getByText("Every 1m")).toBeDefined();
  });

  it("explains recovery and keeps the live acknowledgement action", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    mocks.post.mockResolvedValue({});
    const user = userEvent.setup();

    render(
      <BlackSwanStatusSection
        onRefresh={onRefresh}
        state={makeState({
          reason: "MANUAL_ACK_REQUIRED",
          recoverySince: Date.now() - 61 * 60_000,
          since: Date.now() - 61 * 60_000,
          status: "RECOVERY",
          t: Date.now(),
        })}
      />,
    );

    // PROD:BLACK_SWAN_RISK_SENTINEL
    expect(screen.getByText("Entries and averaging are blocked")).toBeDefined();
    expect(screen.getByText(/cooldown is complete/)).toBeDefined();
    expect(screen.getByText("Recovery cooldown")).toBeDefined();
    expect(screen.getByText("Complete")).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Acknowledge recovery" }),
    );

    expect(mocks.post).toHaveBeenCalledWith(expect.any(String), {
      action: "acknowledge-recovery",
    });
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("places the persistent decision section before Entry Signals", () => {
    const source = readFileSync(
      path.resolve("src/components/LiveDashboard/LiveDashboardPage.tsx"),
      "utf8",
    );

    // PROD:BLACK_SWAN_RISK_SENTINEL
    expect(source.indexOf("<BlackSwanStatusSection")).toBeGreaterThan(-1);
    expect(source.indexOf("<BlackSwanStatusSection")).toBeLessThan(
      source.indexOf("<EntrySignals"),
    );
    expect(source).toMatch(
      /<Grid size=\{\{ xl: 4, lg: 3, md: 6, xs: 12 \}\}>\s*<BlackSwanStatusSection[\s\S]*?<EntrySignals/,
    );
  });
});
