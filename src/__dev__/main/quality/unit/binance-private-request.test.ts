import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: mocks.post,
  },
}));

vi.mock("@/lib/exchange/account-context", () => ({
  getCurrentExchangeAccountSlug: () => "binance-1",
}));

vi.mock("@/lib/exchange/credentials", () => ({
  getBinanceCredentials: () => ({
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
  }),
}));

vi.mock("@lib/trading", () => ({
  tradeLog: {
    error: vi.fn(),
  },
}));

import { requestPrivate } from "@/lib/exchange/platform/binance/utils";

describe("Binance private request", () => {
  it("can send signed POST parameters in the query string", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_750_000_000_000);
    mocks.post.mockResolvedValue({ data: { id: "withdraw-id" } });

    await requestPrivate(
      "/sapi/v1/capital/withdraw/apply",
      {
        address: "0xabc",
        amount: "3",
        coin: "USDT",
        network: "BSC",
      },
      "post",
      "https://api.binance.com",
      { postParamsInQuery: true },
    );

    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/api\.binance\.com\/sapi\/v1\/capital\/withdraw\/apply\?.+&signature=[a-f0-9]{64}$/,
      ),
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-MBX-APIKEY": "test-api-key",
        }),
      }),
    );

    const requestUrl = mocks.post.mock.calls[0][0] as string;
    expect(requestUrl).toContain("address=0xabc");
    expect(requestUrl).toContain("amount=3");
    expect(requestUrl).toContain("coin=USDT");
    expect(requestUrl).toContain("network=BSC");
    expect(requestUrl).toContain("recvWindow=5000");
    expect(requestUrl).toContain("timestamp=1750000000000");
  });

  it("preserves Binance API codes on private request failures", async () => {
    mocks.post.mockRejectedValueOnce({
      response: {
        data: {
          code: -2015,
          msg: "Invalid API-key, IP, or permissions for action",
        },
      },
    });

    await expect(
      requestPrivate(
        "/fapi/v1/leverage",
        {
          leverage: 2,
          symbol: "INJUSDT",
        },
        "post",
        "https://fapi.binance.com",
      ),
    ).rejects.toMatchObject({
      code: -2015,
      message: expect.stringContaining("code: -2015"),
    });
  });
});
