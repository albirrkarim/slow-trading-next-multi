import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPrivate: vi.fn(),
}));

vi.mock("@/lib/exchange/platform/binance/utils", async () => {
  const actual = await vi.importActual<any>(
    "@/lib/exchange/platform/binance/utils",
  );

  return {
    ...actual,
    requestPrivate: mocks.requestPrivate,
  };
});

import {
  setFuturesLeverage,
  setFuturesMarginType,
} from "@/lib/exchange/platform/binance/futures/leverage";
import { BinanceApiError } from "@/lib/exchange/platform/binance/utils";

describe("Binance futures account setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates a rejected leverage request", async () => {
    mocks.requestPrivate.mockRejectedValue(
      new BinanceApiError("Invalid API permissions (code: -2015)", -2015),
    );

    await expect(setFuturesLeverage("INJUSDT", 2)).rejects.toMatchObject({
      code: -2015,
    });
  });

  it("accepts Binance's already-configured margin response", async () => {
    mocks.requestPrivate.mockRejectedValue(
      new BinanceApiError("No need to change margin type (code: -4046)", -4046),
    );

    await expect(
      setFuturesMarginType("INJUSDT", "ISOLATED"),
    ).resolves.toBe(true);
  });

  it("propagates a rejected margin-type request", async () => {
    mocks.requestPrivate.mockRejectedValue(
      new BinanceApiError("Invalid API permissions (code: -2015)", -2015),
    );

    await expect(
      setFuturesMarginType("INJUSDT", "ISOLATED"),
    ).rejects.toMatchObject({ code: -2015 });
  });
});
