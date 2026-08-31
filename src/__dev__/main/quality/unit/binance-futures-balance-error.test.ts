import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPrivate: vi.fn(),
}));

vi.mock("@/lib/exchange/platform/binance/utils", () => ({
  requestPrivate: mocks.requestPrivate,
}));

import { getFuturesBalance } from "@/lib/exchange/platform/binance/futures/balance";

it("preserves futures API failures instead of converting them to no balance", async () => {
  const apiError = Object.assign(
    new Error(
      "Binance API Error: Invalid API-key, IP, or permissions for action (code: -2015)",
    ),
    { code: -2015 },
  );
  mocks.requestPrivate.mockRejectedValue(apiError);

  await expect(getFuturesBalance("USDT")).rejects.toBe(apiError);
});
