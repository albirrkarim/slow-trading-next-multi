/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnackbarProvider } from "notistack";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BinanceCooldownStatusSection from "@/components/LiveDashboard/BinanceCooldownStatusSection";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    isAxiosError: vi.fn(() => false),
    post: mocks.post,
  },
}));

describe("BinanceCooldownStatusSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    render(
      <SnackbarProvider>
        <BinanceCooldownStatusSection onReset={vi.fn()} state={state} />
      </SnackbarProvider>,
    );
    // PROD:BINANCE_PERSISTENT_COOLDOWN
    expect(screen.getByRole("region", { name: "Binance REST health" })).toBeDefined();
    expect(screen.getByText("COOLDOWN")).toBeDefined();
    expect(screen.getByText(/^Start:/)).toBeDefined();
    expect(screen.getByText(/^End:/)).toBeDefined();
    expect(screen.getAllByText(/private \/fapi\/v2\/balance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 detections/)).toBeDefined();
  });

  it("manually resets an active cooldown and applies the returned health", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const t = Date.now() - 60_000;
    const resetHealth = {
      current: null,
      logs: [
        {
          endpoint: "/fapi/v1/klines",
          end: Date.now(),
          id: "cooldown-1",
          kind: "public" as const,
          occurrences: 1,
          reason: "IP banned",
          t,
        },
      ],
    };
    mocks.post.mockResolvedValue({ data: resetHealth });
    const state = {
      binanceHealth: {
        current: {
          endpoint: "/fapi/v1/klines",
          kind: "public",
          reason: "IP banned",
          retryAt: Date.now() + 20 * 60_000,
          startedAt: t,
        },
        logs: resetHealth.logs,
      },
    } as SlowTradingDashboardState;

    render(
      <SnackbarProvider>
        <BinanceCooldownStatusSection onReset={onReset} state={state} />
      </SnackbarProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Reset cooldown" }));

    // PROD:BINANCE_MANUAL_COOLDOWN_RESET
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/slow-trading/binance-cooldown-reset",
    );
    expect(onReset).toHaveBeenCalledWith(resetHealth);
  });
});
