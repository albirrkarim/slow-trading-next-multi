import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const AUTH_COOKIE = "dashboard_auth";
const PIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;
const PROD_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const DEV_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type AttemptState = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptState>();

function hmacSha256Hex(secret: string, input: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function getClientKey(req: NextApiRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return String(firstForwarded || req.socket.remoteAddress || "unknown").trim();
}

function getAttemptState(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 0, resetAt: now + PIN_ATTEMPT_WINDOW_MS };
    attempts.set(key, next);
    return next;
  }

  return current;
}

function recordFailedAttempt(key: string) {
  const state = getAttemptState(key);
  state.count += 1;
  attempts.set(key, state);
  return state;
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

function createSessionToken(pin: string, salt: string, maxAgeSeconds: number) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = hmacSha256Hex(`${pin}:${salt}`, payload);
  return `v1.${payload}.${signature}`;
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return (
    aBuffer.length === bBuffer.length &&
    crypto.timingSafeEqual(aBuffer, bBuffer)
  );
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pin = process.env.DASHBOARD_PIN;
  if (!pin) {
    return res.status(500).json({ error: "DASHBOARD_PIN is not configured" });
  }

  const clientKey = getClientKey(req);
  const attemptState = getAttemptState(clientKey);
  if (attemptState.count >= PIN_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((attemptState.resetAt - Date.now()) / 1000),
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: `Too many PIN attempts. Try again in ${retryAfterSeconds} seconds.`,
    });
  }

  const bodyPin = typeof req.body?.pin === "string" ? req.body.pin : "";
  if (!/^\d{6}$/.test(bodyPin)) {
    recordFailedAttempt(clientKey);
    return res.status(400).json({ error: "Invalid access code" });
  }

  if (!safeEqual(bodyPin, pin)) {
    recordFailedAttempt(clientKey);
    return res.status(401).json({ error: "Invalid access code" });
  }

  clearAttempts(clientKey);

  const salt = process.env.DASHBOARD_PIN_SALT ?? "";
  const isProd = process.env.NODE_ENV === "production";
  const maxAgeSeconds = isProd
    ? PROD_SESSION_MAX_AGE_SECONDS
    : DEV_SESSION_MAX_AGE_SECONDS;
  const token = createSessionToken(pin, salt, maxAgeSeconds);
  const cookie = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ success: true });
}
