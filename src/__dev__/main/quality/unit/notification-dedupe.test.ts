import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpRoot: string | null = null;
let axiosPostMock: ReturnType<typeof vi.fn>;

describe("notification dedupe", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notification-dedupe-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    process.env.EMAIL_TO = "receiver@example.com";
    process.env.N8N_EMAIL_PROXY_URL =
      "https://crm.reinventwp.com/webhook/trading-email-proxy";

    axiosPostMock = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.resetModules();
    vi.doMock("axios", () => ({
      default: {
        post: axiosPostMock,
      },
    }));
  });

  afterEach(async () => {
    vi.doUnmock("axios");
    vi.resetModules();

    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    delete process.env.EMAIL_TO;
    delete process.env.APP_NAME;
    delete process.env.N8N_EMAIL_PROXY_TOKEN;
    delete process.env.N8N_EMAIL_PROXY_URL;
  });

  it("prefixes email subjects with APP_NAME", async () => {
    process.env.APP_NAME = "wealth.reinventwp.com";
    const { notif } = await import("@/lib/notification");

    await notif.email({
      subject: "[TEST] hello",
      body: "test body",
    });

    // PROD:NOTIF_APP_NAME_PREFIX
    expect(axiosPostMock).toHaveBeenCalledWith(
      process.env.N8N_EMAIL_PROXY_URL,
      expect.objectContaining({
        subject: "[wealth.reinventwp.com] [TEST] hello",
      }),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("sends a dashboard notification only once for the same dedupe key", async () => {
    const { FILES } = await import("@/components/storage");
    const { notif } = await import("@/lib/notification");

    await fs.ensureDir(path.dirname(FILES.slow.config));
    await fs.writeJSON(FILES.slow.config, {
      runtime: {
        notification: {
          telegram: {
            enabled: false,
            types: [],
          },
          email: {
            enabled: true,
            types: [
              {
                id: "NOTIF_HIGH_VOLATILITY",
                params: { level: 3 },
              },
            ],
          },
        },
      },
    });

    const payload = {
      dashboard: "SLOW" as const,
      key: "NOTIF_HIGH_VOLATILITY",
      dedupeKey: "slow-high-volatility:binance:BTC:point-1:-2:BOTTOM",
      title: "[VOL] BTC level -2 BOTTOM",
      message: "same volatility point",
    };

    await notif.central(payload);
    await notif.central(payload);

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(await fs.pathExists(FILES.slow.notificationDedupe)).toBe(true);
  });

  it("sends email through the n8n CRM proxy", async () => {
    process.env.APP_NAME = "wealth.reinventwp.com";
    process.env.N8N_EMAIL_PROXY_TOKEN = "proxy-token";
    process.env.N8N_EMAIL_PROXY_URL =
      "https://crm.reinventwp.com/webhook/trading-email-proxy";
    const { notif } = await import("@/lib/notification");

    await notif.email({
      body: "body text",
      subject: "[DAILY] report",
    });

    // PROD:NOTIF_EMAIL_CRM_PROXY
    expect(axiosPostMock).toHaveBeenCalledWith(
      process.env.N8N_EMAIL_PROXY_URL,
      expect.objectContaining({
        appName: "wealth.reinventwp.com",
        body: "body text",
        source: "slow-trading",
        subject: "[wealth.reinventwp.com] [DAILY] report",
        to: "receiver@example.com",
      }),
      expect.objectContaining({
        headers: { Authorization: "Bearer proxy-token" },
        timeout: 30_000,
      }),
    );
  });
});
