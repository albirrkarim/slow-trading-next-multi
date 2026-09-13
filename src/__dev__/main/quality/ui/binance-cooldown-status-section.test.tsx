/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BinanceCooldownStatusSection from "@/components/LiveDashboard/BinanceCooldownStatusSection";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";

describe("BinanceCooldownStatusSection", () => {
  it("shows active start/end Jakarta time and persisted incident logs", async () => {
    window.localStorage.clear();
    const t = Date.now() - 5 * 60_000;
    const end = Date.now() + 20 * 60_000;
    const state = {
      binanceHealth: {
        current: {
          endpoint: "/fapi/v2/balance",
          kind: "private",
          reason: "Way too many requests",
          retryAt: end,
          startedAt: t,
        },
        logs: [
          {
            id: "cooldown-1",
            t,
            end,
            endpoint: "/fapi/v2/balance",
            kind: "private",
            occurrences: 2,
            reason: "Way too many requests",
          },
        ],
      },
    } as SlowTradingDashboardState;

    render(<BinanceCooldownStatusSection state={state} />);
    // PROD:BINANCE_PERSISTENT_COOLDOWN
    expect(screen.getByRole("region", { name: "Binance REST health" })).toBeDefined();
    expect(screen.getByText("COOLDOWN")).toBeDefined();
    expect(screen.getByText(/^Start:/)).toBeDefined();
    expect(screen.getByText(/^End:/)).toBeDefined();
    expect(screen.getAllByText(/private \/fapi\/v2\/balance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 detections/)).toBeDefined();
  });
});
