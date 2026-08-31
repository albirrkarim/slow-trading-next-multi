import { buildTradeMarkersFromHistory } from "@/components/LiveDashboard/Shared/trade-chart-markers";
import { describe, expect, it } from "vitest";

describe("trade chart markers", () => {
  it("builds sorted entry and exit markers only for the requested symbol", () => {
    const markers = buildTradeMarkersFromHistory(
      [
        {
          opened: {
            t: 4_000,
            vPoint: { id: "SOL_2", lvl: -2 },
            reason: "COMMON",
            message: "[ENTRY] SOL",
            price: 20,
          },
          pnl: { netPct: -1.5 },
          symbol: "SOL",
        },
        {
          opened: {
            t: 2_000,
            vPoint: { id: "BTC_1", lvl: -1 },
            reason: "COMMON",
            message: "[ENTRY] BTC",
            price: 10,
          },
          closed: {
            t: 3_000,
            price: 11,
            feeUsdt: 0,
            reason: "TAKE_PROFIT",
            message: "[EXIT] BTC",
          },
          pnl: { netPct: 2.5 },
          symbol: "btc",
        },
      ],
      "BTC",
    );

    expect(markers).toHaveLength(2);
    expect(markers.map((marker) => marker.text)).toEqual([
      "ENTRY BTC_1",
      "EXIT BTC_1",
    ]);
    expect(markers.map((marker) => Number(marker.time))).toEqual([2, 3]);
  });
});
