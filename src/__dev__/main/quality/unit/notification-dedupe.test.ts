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
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
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

  it("bounds Telegram delivery with the notification request timeout", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    process.env.TELEGRAM_CHAT_ID = "chat-id";
    const { notif } = await import("@/lib/notification");

    await notif.telegram({ body: "body text", subject: "subject" });

    // PROD:NOTIFICATION_REQUEST_TIMEOUT
    expect(axiosPostMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({ chat_id: "chat-id" }),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("retries delivery three times at five-second intervals", async () => {
    vi.useFakeTimers();
    let markFirstAttemptStarted!: () => void;
    const firstAttemptStarted = new Promise<void>((resolve) => {
      markFirstAttemptStarted = resolve;
    });
    axiosPostMock
      .mockImplementationOnce(() => {
        markFirstAttemptStarted();
        return Promise.reject(new Error("temporary failure 1"));
      })
      .mockRejectedValueOnce(new Error("temporary failure 2"))
      .mockRejectedValueOnce(new Error("temporary failure 3"))
      .mockResolvedValueOnce({ data: { ok: true } });
    const { notif } = await import("@/lib/notification");

    const delivery = notif.email({ body: "body text", subject: "subject" });
    await firstAttemptStarted;
    await vi.advanceTimersByTimeAsync(15_000);

    // PROD:NOTIFICATION_DELIVERY_RETRY
    await expect(delivery).resolves.toBe(true);
    expect(axiosPostMock).toHaveBeenCalledTimes(4);
  });

  it("persists an error and does not dedupe a delivery that exhausts retries", async () => {
    vi.useFakeTimers();
    let markFirstAttemptStarted!: () => void;
    const firstAttemptStarted = new Promise<void>((resolve) => {
      markFirstAttemptStarted = resolve;
    });
    axiosPostMock.mockImplementation(() => {
      markFirstAttemptStarted();
      return Promise.reject(new Error("CRM unavailable"));
    });
    const { FILES } = await import("@/components/storage");
    const { notif } = await import("@/lib/notification");
    const { tradeLog } = await import("@/lib/trading/helper/log");
    const errorLogSpy = vi
      .spyOn(tradeLog, "error")
      .mockImplementation(() => undefined);

    await fs.ensureDir(path.dirname(FILES.slow.config));
    await fs.writeJSON(FILES.slow.config, {
      runtime: {
        notification: {
          telegram: { enabled: false, types: [] },
          email: {
            enabled: true,
            types: [{ id: "NOTIF_ERROR" }],
          },
        },
      },
    });

    const delivery = notif.central({
      dashboard: "SLOW",
      key: "NOTIF_ERROR",
      dedupeKey: "failed-delivery",
      title: "Failed notification",
      message: "delivery test",
    });
    await firstAttemptStarted;
    await vi.advanceTimersByTimeAsync(15_000);
    await delivery;

    // PROD:NOTIFICATION_DELIVERY_RETRY
    expect(axiosPostMock).toHaveBeenCalledTimes(4);
    expect(errorLogSpy).toHaveBeenCalledWith(
      "[notification] email delivery failed after 3 retries",
      expect.any(Error),
    );
    expect(await fs.pathExists(FILES.slow.notificationDedupe)).toBe(false);
    const errors = await fs.readJSON(FILES.slow.logs.errors);
    expect(errors).toEqual([
      expect.objectContaining({
        source: "notification.email",
        status: "new",
        message: "CRM unavailable",
        details: expect.objectContaining({
          attempts: 4,
          maxRetries: 3,
          retryDelayMs: 5_000,
          subject: expect.stringContaining("Failed notification"),
        }),
      }),
    ]);
  });
});
