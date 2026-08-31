import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPrivate: vi.fn(),
}));

vi.mock("@/lib/exchange/platform/binance/utils", () => ({
  requestPrivate: mocks.requestPrivate,
}));

import {
  normalizeBinanceUSDTNetwork,
  withdrawUSDT,
} from "@/lib/exchange/platform/binance/account/withdraw";

describe("slow specs Binance Futures withdrawal transfer", () => {
  beforeEach(() => {
    mocks.requestPrivate.mockReset();
    vi.useFakeTimers({ now: 1_750_000_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes a saved network label to the Binance network code", () => {
    expect(
      normalizeBinanceUSDTNetwork("BSC - BNB SMART CHAIN (BEP20)"),
    ).toBe("BSC");
  });

  it("transfers the Spot shortfall from Futures before withdrawing", async () => {
    mocks.requestPrivate.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/api/v3/account") {
        return { balances: [{ asset: "USDT", free: "1.25" }] };
      }
      if (endpoint === "/sapi/v1/account/apiRestrictions") {
        return { permitsUniversalTransfer: true };
      }
      if (endpoint === "/fapi/v2/balance") {
        return [{ asset: "USDT", availableBalance: "10.9" }];
      }
      if (endpoint === "/sapi/v1/asset/transfer") {
        return { tranId: 123 };
      }
      if (endpoint === "/sapi/v1/capital/config/getall") {
        return [{ coin: "USDT", free: "3" }];
      }
      if (endpoint === "/sapi/v1/capital/withdraw/apply") {
        return { id: "withdraw-id" };
      }
      throw new Error(`Unexpected Binance endpoint: ${endpoint}`);
    });

    const result = await withdrawUSDT({
      address: "0xabc",
      amountUSDT: 3,
      network: "BSC",
      transferFromFutures: true,
    });

    // PROD:FUTURES_WITHDRAWAL_TRANSFER
    expect(mocks.requestPrivate.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/api/v3/account",
      "/sapi/v1/account/apiRestrictions",
      "/fapi/v2/balance",
      "/sapi/v1/asset/transfer",
      "/sapi/v1/capital/config/getall",
      "/sapi/v1/capital/withdraw/apply",
    ]);
    expect(mocks.requestPrivate).toHaveBeenNthCalledWith(
      4,
      "/sapi/v1/asset/transfer",
      {
        amount: "1.75",
        asset: "USDT",
        type: "UMFUTURE_MAIN",
      },
      "post",
      "https://api.binance.com",
      { postParamsInQuery: true },
    );
    expect(result).toEqual({
      id: "withdraw-id",
      transferredFromFuturesUSDT: 1.75,
      transferId: 123,
    });
  });

  it("waits for withdrawal settlement and retries transient ownership once", async () => {
    let withdrawableReads = 0;
    let withdrawalAttempts = 0;
    mocks.requestPrivate.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/api/v3/account") {
        return { balances: [{ asset: "USDT", free: "0" }] };
      }
      if (endpoint === "/sapi/v1/account/apiRestrictions") {
        return { permitsUniversalTransfer: true };
      }
      if (endpoint === "/fapi/v2/balance") {
        return [{ asset: "USDT", availableBalance: "10" }];
      }
      if (endpoint === "/sapi/v1/asset/transfer") {
        return { tranId: 456 };
      }
      if (endpoint === "/sapi/v1/capital/config/getall") {
        withdrawableReads += 1;
        return [{ coin: "USDT", free: withdrawableReads === 1 ? "0" : "2" }];
      }
      if (endpoint === "/sapi/v1/capital/withdraw/apply") {
        withdrawalAttempts += 1;
        if (withdrawalAttempts === 1) {
          throw new Error(
            "Binance API Error: User does not own this currency. (code: -4024)",
          );
        }
        return { id: "withdraw-id" };
      }
      throw new Error(`Unexpected Binance endpoint: ${endpoint}`);
    });

    const resultPromise = withdrawUSDT({
      address: "0xabc",
      amountUSDT: 2,
      network: "BSC",
      transferFromFutures: true,
      withdrawOrderId: "same-withdraw-id",
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // PROD:FUTURES_WITHDRAWAL_SETTLEMENT
    expect(withdrawableReads).toBe(2);
    expect(withdrawalAttempts).toBe(2);
    const withdrawalCalls = mocks.requestPrivate.mock.calls.filter(
      ([endpoint]) => endpoint === "/sapi/v1/capital/withdraw/apply",
    );
    expect(withdrawalCalls[0][1].withdrawOrderId).toBe("same-withdraw-id");
    expect(withdrawalCalls[1][1].withdrawOrderId).toBe("same-withdraw-id");
    expect(result).toEqual({
      id: "withdraw-id",
      transferredFromFuturesUSDT: 2,
      transferId: 456,
    });
  });

  it("explains when the Binance API key lacks universal-transfer permission", async () => {
    mocks.requestPrivate.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/api/v3/account") {
        return { balances: [{ asset: "USDT", free: "0" }] };
      }
      if (endpoint === "/sapi/v1/account/apiRestrictions") {
        return { permitsUniversalTransfer: false };
      }
      throw new Error(`Unexpected Binance endpoint: ${endpoint}`);
    });

    await expect(
      withdrawUSDT({
        address: "0xabc",
        amountUSDT: 3,
        network: "BSC",
        transferFromFutures: true,
      }),
    ).rejects.toThrow('Enable "Permits Universal Transfer"');

    expect(mocks.requestPrivate.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/api/v3/account",
      "/sapi/v1/account/apiRestrictions",
    ]);
  });

  it("uses existing Spot funds without repeating a Futures transfer", async () => {
    mocks.requestPrivate.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/api/v3/account") {
        return { balances: [{ asset: "USDT", free: "3" }] };
      }
      if (endpoint === "/sapi/v1/capital/withdraw/apply") {
        return { id: "withdraw-id" };
      }
      throw new Error(`Unexpected Binance endpoint: ${endpoint}`);
    });

    const result = await withdrawUSDT({
      address: "0xabc",
      amountUSDT: 3,
      network: "BSC",
      transferFromFutures: true,
    });

    // PROD:FUTURES_WITHDRAWAL_TRANSFER
    expect(mocks.requestPrivate.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/api/v3/account",
      "/sapi/v1/capital/withdraw/apply",
    ]);
    expect(result).toEqual({ id: "withdraw-id" });
  });
});
