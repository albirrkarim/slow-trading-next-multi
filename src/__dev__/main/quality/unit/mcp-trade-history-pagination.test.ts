import { describe, expect, it } from "vitest";
import slowTradingTradeHistoryPagination, {
  type TradeHistoryPagePosition,
} from "@/lib/slowTrading/mcp/history-pagination";

function trade(id: string, openedAt: number): TradeHistoryPagePosition {
  return { account: "main", closed: { t: openedAt + 10 }, direction: "LONG", opened: { t: openedAt, vPoint: { id } }, symbol: "BTC" };
}

describe("MCP trade-history pagination", () => {
  // PROD:MCP_TRADE_HISTORY_PAGINATION
  it("walks every newest-first page without repeating newly appended trades", () => {
    const positions = [trade("a", 1), trade("b", 2), trade("c", 3)];
    const first = slowTradingTradeHistoryPagination.paginate({ limit: 2, mode: "sandbox", positions });
    const second = slowTradingTradeHistoryPagination.paginate({ cursor: first.nextCursor, limit: 2, mode: "sandbox", positions: [...positions, trade("new", 4)] });
    expect(first.items.map((item) => item.opened?.vPoint?.id)).toEqual(["c", "b"]);
    expect(first.hasMore).toBe(true);
    expect(second.items.map((item) => item.opened?.vPoint?.id)).toEqual(["a"]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("keeps duplicate keys reachable and rejects filter-mismatched cursors", () => {
    const duplicate = trade("same", 1);
    const positions = [duplicate, structuredClone(duplicate), trade("new", 2)];
    const first = slowTradingTradeHistoryPagination.paginate({ limit: 2, mode: "live", positions, symbol: "BTC" });
    const second = slowTradingTradeHistoryPagination.paginate({ cursor: first.nextCursor, limit: 2, mode: "live", positions, symbol: "BTC" });
    expect(second.items).toHaveLength(1);
    expect(() => slowTradingTradeHistoryPagination.paginate({ cursor: first.nextCursor, limit: 1, mode: "sandbox", positions: [], symbol: "BTC" })).toThrow(/does not match/i);
  });
});
