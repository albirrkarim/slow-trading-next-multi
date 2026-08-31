import { describe, expect, it } from "vitest";

import slowTrading from "@/lib/slowTrading";

// PROD:MCP_FINANCE_SUMMARY

function closedPosition(input: {
  entryFee?: number;
  exitFee?: number;
  netUsdt?: number;
  t: string;
}) {
  return {
    closed: {
      feeUsdt: input.exitFee,
      t: new Date(input.t).getTime(),
    },
    fees: {
      entryUsdt: input.entryFee,
    },
    pnl: {
      netUsdt: input.netUsdt,
    },
  };
}

describe("SLOW finance summary", () => {
  it("aggregates only closed-trade realized P&L inside the selected UTC period", () => {
    const result = slowTrading.financeSummary.create({
      end: "2026-08-31",
      generatedAt: new Date("2026-09-01T00:00:00.000Z"),
      instanceName: "test-live",
      mode: "live",
      positions: [
        closedPosition({ entryFee: 0.1, exitFee: 0.2, netUsdt: 12.5, t: "2026-08-01T00:00:00.000Z" }),
        closedPosition({ entryFee: 0.05, exitFee: 0.1, netUsdt: -4, t: "2026-08-01T23:59:59.999Z" }),
        closedPosition({ netUsdt: 0, t: "2026-08-20T12:00:00.000Z" }),
        closedPosition({ netUsdt: 99, t: "2026-07-31T23:59:59.999Z" }),
        closedPosition({ netUsdt: 88, t: "2026-09-01T00:00:00.000Z" }),
      ],
      start: "2026-08-01",
    });

    expect(result).toMatchObject({
      closedTradeCount: 3,
      flatTradeCount: 1,
      grossLossUsdt: 4,
      grossProfitUsdt: 12.5,
      includedTradeCount: 3,
      instanceName: "test-live",
      knownFeesUsdt: 0.45,
      losingTradeCount: 1,
      mode: "live",
      period: { days: 31, end: "2026-08-31", start: "2026-08-01" },
      realizedNetPnlUsdt: 8.5,
      status: "ready",
      winningTradeCount: 1,
    });
    expect(result.daily).toEqual([
      {
        closedTradeCount: 2,
        date: "2026-08-01",
        grossLossUsdt: 4,
        grossProfitUsdt: 12.5,
        knownFeesUsdt: 0.45,
        realizedNetPnlUsdt: 8.5,
      },
      {
        closedTradeCount: 1,
        date: "2026-08-20",
        grossLossUsdt: 0,
        grossProfitUsdt: 0,
        knownFeesUsdt: 0,
        realizedNetPnlUsdt: 0,
      },
    ]);
  });

  it("marks missing persisted P&L as partial instead of coercing it to zero", () => {
    const result = slowTrading.financeSummary.create({
      end: "2026-08-02",
      instanceName: "test-live",
      mode: "live",
      positions: [closedPosition({ t: "2026-08-02T10:00:00.000Z" })],
      start: "2026-08-01",
    });

    expect(result).toMatchObject({
      closedTradeCount: 1,
      includedTradeCount: 0,
      missingPnlTradeCount: 1,
      realizedNetPnlUsdt: 0,
      status: "partial",
    });
    expect(result.message).toContain("excluded");
  });

  it("rejects invalid or unbounded ranges", () => {
    expect(() => slowTrading.financeSummary.range.resolve("2026-08-02", "2026-08-01")).toThrow("start must be on or before end");
    expect(() => slowTrading.financeSummary.range.resolve("2024-01-01", "2026-08-01")).toThrow("cannot exceed 731 days");
  });
});
