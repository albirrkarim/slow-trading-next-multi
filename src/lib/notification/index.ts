import axios from "axios";
import { FILES } from "@/components/storage";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import {
  createDefaultDashboardNotificationConfig,
  getChannelsForNotification,
  normalizeDashboardNotificationConfig,
  type DashboardNotificationConfig,
  type NotificationChannel,
  type NotificationDashboard,
} from "./config";
import { tradeLog } from "@/lib/trading/helper/log";

dotenv.config();

type LegacyNotifParam = {
  subject?: string;
  body?: string;
};

type DashboardNotifParam = {
  dashboard: NotificationDashboard;
  key: string;
  channel?: NotificationChannel;
  title?: string;
  message?: string;
  dedupeKey?: string;
};

type NotificationDedupeRecord = {
  sentAt: number;
  subject?: string;
};

type NotificationDedupeStore = Record<string, NotificationDedupeRecord>;
const inFlightDedupeKeys = new Set<string>();
const DEFAULT_N8N_EMAIL_PROXY_URL =
  "https://crm.reinventwp.com/webhook/trading-email-proxy-railway-fallback";

function getAppNamePrefix() {
  const appName = String(process.env.APP_NAME ?? "").trim();
  return appName ? `[${appName}]` : "";
}

function prefixEmailSubject(subject: string | undefined) {
  const prefix = getAppNamePrefix();
  const normalizedSubject = String(subject ?? "").trim();
  if (!prefix) return normalizedSubject;
  if (normalizedSubject.startsWith(prefix)) return normalizedSubject;
  return `${prefix} ${normalizedSubject}`.trim();
}

async function loadDashboardNotificationConfig(
  dashboard: NotificationDashboard,
): Promise<DashboardNotificationConfig> {
  try {
    if (!(await fs.pathExists(FILES.slow.config))) {
      return createDefaultDashboardNotificationConfig("SLOW");
    }

    const data = await fs.readJSON(FILES.slow.config);
    return normalizeDashboardNotificationConfig(
      data?.runtime?.notification,
      "SLOW",
    );
  } catch (error) {
    tradeLog.error(`Failed to load ${dashboard} notification config:`, error);
    return createDefaultDashboardNotificationConfig(dashboard);
  }
}

function normalizeDedupeKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function readDedupeStore(): Promise<NotificationDedupeStore> {
  try {
    if (!(await fs.pathExists(FILES.slow.notificationDedupe))) {
      return {};
    }

    const raw = await fs.readJSON(FILES.slow.notificationDedupe);

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    return raw as NotificationDedupeStore;
  } catch (error) {
    tradeLog.error("Failed to read notification dedupe store:", error);
    return {};
  }
}

async function writeDedupeStore(store: NotificationDedupeStore): Promise<void> {
  await fs.ensureDir(path.dirname(FILES.slow.notificationDedupe));
  await fs.writeJSON(FILES.slow.notificationDedupe, store);
}

async function wasNotificationAlreadySent(dedupeKey: string): Promise<boolean> {
  const store = await readDedupeStore();
  return Boolean(store[normalizeDedupeKey(dedupeKey)]);
}

async function rememberSentNotification(params: {
  dedupeKey: string;
  subject?: string;
}): Promise<void> {
  const store = await readDedupeStore();
  store[normalizeDedupeKey(params.dedupeKey)] = {
    sentAt: Date.now(),
    subject: params.subject,
  };
  await writeDedupeStore(store);
}

/**
 * Sends email through the n8n CRM webhook.
 */
async function sendEmailViaN8nProxy(
  payload: Required<Pick<LegacyNotifParam, "subject" | "body">> & {
    to: string;
  },
): Promise<void> {
  // PROD:NOTIF_EMAIL_CRM_PROXY
  const url = String(
    process.env.N8N_EMAIL_PROXY_URL ?? DEFAULT_N8N_EMAIL_PROXY_URL,
  ).trim();

  if (!url) {
    throw new Error("Missing N8N_EMAIL_PROXY_URL for CRM email delivery");
  }

  const token = String(process.env.N8N_EMAIL_PROXY_TOKEN ?? "").trim();
  await axios.post(
    url,
    {
      appName: process.env.APP_NAME ?? "",
      body: payload.body,
      source: "slow-trading",
      subject: payload.subject,
      to: payload.to,
    },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      timeout: 30_000,
    },
  );
}

async function email({ subject, body }: LegacyNotifParam): Promise<void> {
  const mailOptions = {
    to: process.env.EMAIL_TO ?? "albirkarim2@gmail.com",
    subject: prefixEmailSubject(subject),
    text: body,
  };

  try {
    await sendEmailViaN8nProxy({
      body: mailOptions.text ?? "",
      subject: mailOptions.subject,
      to: mailOptions.to,
    });
  } catch (error) {
    tradeLog.error("Error sending email via CRM:", error);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function telegram({ subject, body }: LegacyNotifParam): Promise<void> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment variables.",
    );
  }

  const message = `<b>${prefixEmailSubject(escapeHtml(subject ?? ""))}</b>\n\n${escapeHtml(body ?? "")}`;

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      },
    );

    if (!res.data.ok) {
      tradeLog.error("Telegram API error:", res.data);
    }
  } catch (error) {
    tradeLog.error("Failed to send Telegram message:", error);
  }
}

async function sendToChannel(
  payload: LegacyNotifParam,
  channel: NotificationChannel,
): Promise<void> {
  if (channel === "email") {
    await email(payload);
    return;
  }

  await telegram(payload);
}

async function send(
  payload: LegacyNotifParam,
  channels?: NotificationChannel[] | null,
): Promise<void> {
  if (channels == null) {
    await sendToChannel(payload, "telegram");
    return;
  }

  for (const channel of channels) {
    await sendToChannel(payload, channel);
  }
}

async function central(
  payload: LegacyNotifParam | DashboardNotifParam,
  channel: NotificationChannel = "telegram",
): Promise<void> {
  if ("dashboard" in payload) {
    const normalizedDedupeKey = payload.dedupeKey
      ? normalizeDedupeKey(payload.dedupeKey)
      : null;

    if (payload.dedupeKey) {
      if (
        inFlightDedupeKeys.has(normalizedDedupeKey!) ||
        (await wasNotificationAlreadySent(payload.dedupeKey))
      ) {
        return;
      }

      inFlightDedupeKeys.add(normalizedDedupeKey!);
    }

    try {
      const config = await loadDashboardNotificationConfig(payload.dashboard);
      const configuredChannels = getChannelsForNotification(
        config,
        payload.key,
      );
      const channels =
        payload.channel &&
        configuredChannels.includes(payload.channel)
          ? [payload.channel]
          : payload.channel
            ? []
            : configuredChannels;

      if (channels.length === 0) {
        return;
      }

      await send(
        {
          subject: payload.title,
          body: payload.message,
        },
        channels,
      );

      if (payload.dedupeKey) {
        await rememberSentNotification({
          dedupeKey: payload.dedupeKey,
          subject: payload.title,
        });
      }
    } finally {
      if (normalizedDedupeKey) {
        inFlightDedupeKeys.delete(normalizedDedupeKey);
      }
    }
    return;
  }

  await sendToChannel(payload, channel);
}

export const notif = {
  central,
  createDefaultDashboardNotificationConfig,
  email,
  prefixEmailSubject,
  sendEmailViaN8nProxy,
  getChannelsForNotification,
  normalizeDashboardNotificationConfig,
  send,
  telegram,
};

export * from "./config";
