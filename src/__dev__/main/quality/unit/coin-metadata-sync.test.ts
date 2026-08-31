import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    put: mocks.put,
  },
}));

vi.mock("@/lib/trading", () => ({
  tradeLog: {
    log: vi.fn(),
  },
}));

import { coinMetadataSync } from "@/lib/devBacktest/coins/tag-sync";

describe("coin metadata sync", () => {
  afterEach(() => {
    mocks.put.mockReset();
    delete process.env.APP_NAME;
    delete process.env.COIN_METADATA_SYNC_PEERS;
    delete process.env.SYNC_TOKEN;
  });

  it("broadcasts metadata to explicit peers with per-target results", async () => {
    process.env.SYNC_TOKEN = "sync-token";
    mocks.put
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({
        response: {
          data: { error: "Invalid coin metadata sync token" },
          status: 401,
        },
      });

    const state = {
      coinDescriptions: { SOL: "Fast mover" },
      coinTags: { SOL: ["Reviewed"] },
      tags: [],
    };
    const results = await coinMetadataSync.broadcastToPeers(state, [
      "https://fast.reinventwp.com/",
      "https://holy.reinventwp.com",
    ]);

    // PROD:COIN_METADATA_SYNC
    expect(mocks.put).toHaveBeenCalledWith(
      "https://fast.reinventwp.com/api/slow-trading/coin-metadata",
      { syncState: state },
      expect.objectContaining({
        headers: { [coinMetadataSync.header]: "sync-token" },
        timeout: 10_000,
      }),
    );
    expect(results).toEqual([
      { peer: "https://fast.reinventwp.com", success: true },
      {
        error: "Invalid coin metadata sync token",
        peer: "https://holy.reinventwp.com",
        status: 401,
        success: false,
      },
    ]);
  });

  it("requires a sync token for manual metadata broadcast", async () => {
    await expect(
      coinMetadataSync.broadcastToPeers(
        { coinDescriptions: {}, coinTags: {}, tags: [] },
        ["https://fast.reinventwp.com"],
      ),
    ).rejects.toThrow("SYNC_TOKEN is required");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("does not automatically broadcast local metadata even when peers are configured", async () => {
    process.env.APP_NAME = "localhost";
    process.env.COIN_METADATA_SYNC_PEERS = "https://fast.reinventwp.com";
    process.env.SYNC_TOKEN = "sync-token";

    await coinMetadataSync.broadcast({
      coinDescriptions: {},
      coinTags: {},
      tags: [],
    });

    // PROD:COIN_METADATA_SYNC
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("automatically broadcasts metadata between online peers", async () => {
    process.env.APP_NAME = "fast.reinventwp.com";
    process.env.COIN_METADATA_SYNC_PEERS =
      "https://fast.reinventwp.com, https://holy.reinventwp.com";
    process.env.SYNC_TOKEN = "sync-token";
    mocks.put.mockResolvedValue({ data: {} });

    await coinMetadataSync.broadcast({
      coinDescriptions: {},
      coinTags: {},
      tags: [],
    });

    // PROD:COIN_METADATA_SYNC
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
});
