/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlowTradingManagementLogs } from "@/components/LiveDashboard/Feature/SlowTradingLogs";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    delete: mocks.delete,
    get: mocks.get,
  },
}));

describe("SlowTradingManagementLogs", () => {
  afterEach(() => {
    cleanup();
    mocks.delete.mockReset();
    mocks.get.mockReset();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("loads only after expansion and can permanently delete all records", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({
      data: [
        {
          action: "remove",
          createdAt: 100,
          id: "management-1",
          reason: "Latest price 0.09 USDT fell below minimum 0.1 USDT.",
          source:
            "slow-trading.live-cycle.coin-management:auto-remove-min-price",
          symbol: "IOTX",
        },
      ],
    });
    mocks.delete.mockResolvedValue({
      data: { cleared: 1, kind: "management" },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SlowTradingManagementLogs />);

    // PROD:MANAGEMENT_LOG_UI
    expect(mocks.get).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("ExpandMoreIcon").closest("button")!);

    expect(await screen.findByText("IOTX")).toBeDefined();
    expect(screen.getByText("Remove")).toBeDefined();
    expect(mocks.get).toHaveBeenCalledWith(expect.any(String), {
      params: { kind: "management" },
    });

    await user.click(screen.getByRole("button", { name: "Delete All" }));

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith(expect.any(String), {
        params: { all: "true", kind: "management" },
      });
    });
    expect(screen.queryByText("IOTX")).toBeNull();
    expect(screen.getByText("No Coin Management logs recorded yet.")).toBeDefined();
  });
});
