import tradingPosition from "@/lib/trading/position";
import { describe, expect, it } from "vitest";
import { createTestPosition } from "../fixtures/position";

const point = (id: string, t: number, lvl: number) => ({ id, t, lvl });

describe("compact position vPoint path", () => {
  it("stores only ordered intermediate points using entry and exit IDs", () => {
    const position = createTestPosition({
      closed: {
        feeUsdt: 0,
        price: 11,
        reason: "TAKE_PROFIT",
        t: 300,
        vPoint: { id: "T_EXIT", lvl: 0 },
      },
      entryId: "B_ENTRY",
      entryTime: 150,
    });

    const vPoints = tradingPosition.vPoints.intermediate({
      position,
      volatilityPoints: [
        point("AFTER_EXIT", 400, 1),
        point("B_MIDDLE", 200, -3),
        point("T_EXIT", 250, 0),
        point("B_ENTRY", 100, -2),
        point("B_MIDDLE", 210, -3),
      ],
    });

    // BOTH:POSITION_VPOINT_PATH
    expect(vPoints).toEqual([{ id: "B_MIDDLE", lvl: -3 }]);
  });

  it("returns an empty captured path when entry and exit are adjacent", () => {
    const position = createTestPosition({
      closed: {
        feeUsdt: 0,
        price: 11,
        reason: "TAKE_PROFIT",
        t: 200,
        vPoint: { id: "T_EXIT", lvl: 0 },
      },
      entryId: "B_ENTRY",
    });

    expect(
      tradingPosition.vPoints.intermediate({
        position,
        volatilityPoints: [
          point("B_ENTRY", 100, -2),
          point("T_EXIT", 200, 0),
        ],
      }),
    ).toEqual([]);
  });

  it("uses close time when an exchange-synced exit has no vPoint", () => {
    const position = createTestPosition({
      closed: {
        feeUsdt: 0,
        price: 9,
        reason: "UNKNOWN",
        t: 250,
      },
      entryId: "B_ENTRY",
    });

    expect(
      tradingPosition.vPoints.intermediate({
        position,
        volatilityPoints: [
          point("B_ENTRY", 100, -2),
          point("B_MIDDLE", 200, -3),
          point("AFTER_CLOSE", 300, -4),
        ],
      }),
    ).toEqual([{ id: "B_MIDDLE", lvl: -3 }]);
  });

  it("leaves the field unrecoverable when the entry ID is missing", () => {
    const position = createTestPosition({
      closed: {
        feeUsdt: 0,
        price: 11,
        reason: "TAKE_PROFIT",
        t: 200,
      },
      entryId: "MISSING_ENTRY",
    });

    expect(
      tradingPosition.vPoints.intermediate({
        position,
        volatilityPoints: [point("B_OTHER", 100, -2)],
      }),
    ).toBeUndefined();
  });
});
