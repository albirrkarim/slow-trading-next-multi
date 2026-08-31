import { describe, expect, it } from "vitest";

import { createPredictorMemory, predictor } from "@/lib/dynamic";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";

function kline(time: number, close: number): Kline {
  return [
    time,
    String(close),
    String(close),
    String(close),
    String(close),
    "1",
    time,
    "1",
    1,
    "1",
    "1",
    "0",
    "0",
  ];
}

function createTopPointId(symbol: string) {
  let memory = createPredictorMemory(100, 1_700_000_000_000, 5, 1);
  memory = predictor(kline(1_700_000_300_000, 106), memory, symbol).memory;

  const result = predictor(kline(1_700_000_600_000, 104), memory, symbol);

  return result.point?.id;
}

describe("volatility point ids", () => {
  it("includes symbol in the generated hash", () => {
    const btcId = createTopPointId("BTC");
    const ethId = createTopPointId("ETH");

    expect(btcId).toBeDefined();
    expect(ethId).toBeDefined();
    expect(btcId).not.toBe(ethId);
    expect(btcId?.split("_").slice(2).join("_")).toBe(
      ethId?.split("_").slice(2).join("_"),
    );
  });
});
