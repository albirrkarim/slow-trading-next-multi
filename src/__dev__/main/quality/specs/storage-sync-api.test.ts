import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendError: vi.fn(async () => undefined),
  buildStateRealtime: vi.fn(async () => ({ activeMode: "live" })),
  load: vi.fn(async () => ({ storage: true })),
  syncOnlinePersistentStorageToLocal: vi.fn(async () => ({
    backupPath: "/storage-backups/backup",
    directoriesImported: 2,
    filesImported: 3,
    storageRoot: "/storage",
  })),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    debugSync: {
      syncOnlinePersistentStorageToLocal:
        mocks.syncOnlinePersistentStorageToLocal,
    },
    storage: {
      dashboard: {
        buildStateRealtime: mocks.buildStateRealtime,
      },
      data: {
        load: mocks.load,
      },
      logs: {
        appendError: mocks.appendError,
      },
    },
  },
}));

import handler from "@/pages/api/slow-trading/debug/sync-online-to-local";

describe("persistent storage clone API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a deployed server to clone storage from another server", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      body: {
        onlineBaseUrl: "https://source.reinventwp.com",
      },
      headers: {
        host: "current.reinventwp.com",
      },
      method: "POST",
    } as unknown as NextApiRequest;
    const res = {
      status,
    } as unknown as NextApiResponse;

    await handler(req, res);

    // PROD:SYNC_ONLINE_TO_LOCAL
    expect(mocks.syncOnlinePersistentStorageToLocal).toHaveBeenCalledWith({
      onlineBaseUrl: "https://source.reinventwp.com",
      token: process.env.SYNC_TOKEN,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      backupPath: "/storage-backups/backup",
      directoriesImported: 2,
      filesImported: 3,
      storageRoot: "/storage",
    });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.buildStateRealtime).not.toHaveBeenCalled();
  });
});
