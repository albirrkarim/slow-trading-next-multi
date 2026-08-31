/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { SnackbarProvider } from "notistack";
import { describe, expect, it, vi } from "vitest";

import TradeHistoryNotesField from "@/components/LiveDashboard/Reporting/TradeHistoryNotesField";
import { endpoints } from "@/components/endpoints";
import { createTestPosition } from "../fixtures/position";

vi.mock("axios");

describe("trade-history notes", () => {
  it("saves a trimmed position note on blur and refreshes history", async () => {
    const row = {
      ...createTestPosition({
        entryId: "note-entry",
        entryTime: 100,
        symbol: "SUI",
        closed: {
          feeUsdt: 0,
          price: 11,
          reason: "TAKE_PROFIT" as const,
          t: 200,
        },
      }),
      mode: "sandbox" as const,
      symbol: "SUI",
    };
    const nextHistory = [{ ...row, notes: "Breakout retest" }];
    const onHistoryChange = vi.fn();
    vi.mocked(axios.patch).mockResolvedValue({
      data: { state: { history: nextHistory } },
    } as any);

    render(
      <SnackbarProvider>
        <TradeHistoryNotesField
          mode="sandbox"
          onHistoryChange={onHistoryChange}
          readOnly={false}
          row={row}
        />
      </SnackbarProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Notes" });
    fireEvent.change(input, { target: { value: "  Breakout retest  " } });
    fireEvent.blur(input);

    // PROD:TRADE_HISTORY_NOTES
    await waitFor(() =>
      expect(axios.patch).toHaveBeenCalledWith(endpoints.slow.prod.history, {
        account: "binance-1",
        mode: "sandbox",
        symbol: "SUI",
        entryId: "note-entry",
        entryTime: 100,
        exitTime: 200,
        quantity: 1,
        usdt: 10,
        notes: "Breakout retest",
      }),
    );
    expect(onHistoryChange).toHaveBeenCalledWith(nextHistory);
  });
});
