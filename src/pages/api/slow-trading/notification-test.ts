import { notif, type NotificationChannel } from "@/lib/notification";
import type { NextApiRequest, NextApiResponse } from "next";

function pickChannel(value: unknown): NotificationChannel | null {
  return value === "telegram" || value === "email" ? value : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }

  const channel = pickChannel(req.body?.channel);
  if (!channel) {
    res.status(400).json({ error: "Invalid notification channel" });
    return;
  }

  try {
    const appName = String(process.env.APP_NAME ?? "SLOW").trim() || "SLOW";
    await notif.send(
      {
        subject: "[TEST] Notification test",
        body: `Test ${channel} notification from ${appName} at ${new Date().toISOString()}`,
      },
      [channel],
    );
    res.status(200).json({ ok: true, channel });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to send test notification",
    });
  }
}
