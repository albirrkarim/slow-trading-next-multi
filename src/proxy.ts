import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE = "dashboard_auth";
const DEV_BACKTEST_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_BACKTEST === "1" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_BACKTEST === "1";

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith("/slow") ||
    (pathname.startsWith("/api/slow-trading") &&
      !pathname.includes("coin-metadata")) ||
    (DEV_BACKTEST_ENABLED &&
      (pathname.startsWith("/dev/dynamic-trade") ||
        pathname.startsWith("/dev/coins")))
  );
}

function isProtectedApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/slow-trading") &&
    !pathname.includes("coin-metadata")
  );
}

function isSlowSyncExportPath(pathname: string) {
  return pathname === "/api/slow-trading/debug/export";
}

function hasValidSlowSyncToken(req: NextRequest) {
  const expectedToken = process.env.SYNC_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }

  return req.headers.get("x-slow-sync-token") === expectedToken;
}

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/pin") ||
    pathname.startsWith("/api/pin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname.startsWith("/public")
  );
}

async function hmacSha256Hex(secret: string, input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isValidAuthCookie(
  cookieValue: string,
  pin: string,
  salt: string,
) {
  const parts = cookieValue.split(".");
  if (parts[0] !== "v1" || parts.length !== 4) {
    return false;
  }

  const [, expiresAtRaw, nonce, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  if (!/^[a-f0-9]{32,}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) {
    return false;
  }

  const secret = `${pin}:${salt}`;
  const signedPayload = `${expiresAtRaw}.${nonce}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  return signature === expected;
}

function unauthorizedApiResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function redirectToPin(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = "/pin";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtectedPath(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isApiRequest = isProtectedApiPath(pathname);
  if (isSlowSyncExportPath(pathname) && hasValidSlowSyncToken(req)) {
    return NextResponse.next();
  }

  const pin = process.env.DASHBOARD_PIN;
  if (!pin) {
    if (process.env.NODE_ENV === "production") {
      return isApiRequest
        ? unauthorizedApiResponse("Dashboard PIN is not configured")
        : new NextResponse("Dashboard PIN is not configured", { status: 503 });
    }

    if (isApiRequest) {
      return unauthorizedApiResponse("Dashboard PIN is not configured");
    }

    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(AUTH_COOKIE)?.value;
  if (!cookieValue) {
    return isApiRequest
      ? unauthorizedApiResponse("Authentication required")
      : redirectToPin(req);
  }

  const salt = process.env.DASHBOARD_PIN_SALT ?? "";

  if (!(await isValidAuthCookie(cookieValue, pin, salt))) {
    return isApiRequest
      ? unauthorizedApiResponse("Invalid authentication")
      : redirectToPin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/slow",
    "/slow/:path*",
    "/api/slow-trading",
    "/api/slow-trading/:path*",
    "/dev/dynamic-trade",
    "/dev/dynamic-trade/:path*",
    "/dev/coins",
    "/dev/coins/:path*",
  ],
};
