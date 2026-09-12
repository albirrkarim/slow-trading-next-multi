import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  central: vi.fn(),
}));

vi.mock("@/lib/notification", () => ({
  notif: {
    central: notificationMocks.central,
  },
}));

let tmpRoot: string | null = null;

describe("instance public IP", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-instance-ip-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    notificationMocks.central.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.PERSISTENT_STORAGE_ROOT;

    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }
  });

  it("stores the first IP and only notifies after a startup change", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const nowMock = vi
      .spyOn(Date, "now")
      .mockReturnValue(1_780_000_000_000);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "203.0.113.10\n",
    });

    const instanceIp = (await import("@/lib/runtime/instance-ip")).default;

    // PROD:INSTANCE_IP_CHECK_ON_START
    await expect(instanceIp.lifecycle.check()).resolves.toEqual({
      ip: "203.0.113.10",
      t: 1_780_000_000_000,
    });
    expect(notificationMocks.central).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "203.0.113.25",
    });
    nowMock.mockReturnValue(1_780_000_100_000);
    await instanceIp.lifecycle.check();

    // PROD:NOTIF_IP_CHANGED
    expect(notificationMocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: "SLOW",
        key: "NOTIF_IP_CHANGED",
        title: "[IP CHANGED] 203.0.113.10 -> 203.0.113.25",
      }),
    );
    // PROD:INSTANCE_IP_STORAGE
    expect(await fs.readJSON(path.join(tmpRoot!, "slow/ip.json"))).toEqual({
      ip: "203.0.113.25",
      t: 1_780_000_100_000,
    });
  });

  it("keeps the last successful snapshot when ipify returns invalid data", async () => {
    const ipFile = path.join(tmpRoot!, "slow/ip.json");
    await fs.ensureDir(path.dirname(ipFile));
    await fs.writeJSON(ipFile, { ip: "203.0.113.10", t: 1_780_000_000_000 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "not-an-ip",
      }),
    );
    const instanceIp = (await import("@/lib/runtime/instance-ip")).default;

    await expect(instanceIp.lifecycle.check()).resolves.toBeNull();
    expect(await fs.readJSON(ipFile)).toEqual({
      ip: "203.0.113.10",
      t: 1_780_000_000_000,
    });
    expect(notificationMocks.central).not.toHaveBeenCalled();
  });
});
