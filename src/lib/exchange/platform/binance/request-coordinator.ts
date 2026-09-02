import type { AxiosResponse } from "axios";
import { tradeLog } from "@lib/trading";

const MINUTE_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 2 * MINUTE_MS;
const BASE_REQUEST_GAP_MS = 350;
const HIGH_USAGE_REQUEST_GAP_MS = 1_000;
const CRITICAL_USAGE_REQUEST_GAP_MS = 2_000;

type BinanceRequestKind = "private" | "public";

interface BinanceRequestDescriptor {
  domain: string;
  endpoint: string;
  kind: BinanceRequestKind;
  params?: Record<string, unknown>;
}

interface BinanceUsageState {
  usedWeight: number;
  windowStartMs: number;
}

export interface BinanceCooldownState {
  reason: string;
  retryAt: number;
}

export class BinanceApiError extends Error {
  readonly code?: number | string;
  readonly status?: number;

  constructor(
    message: string,
    codeOrOptions:
      | number
      | string
      | {
          code?: number | string;
          status?: number;
        } = {},
  ) {
    super(message);
    const options =
      typeof codeOrOptions === "number" || typeof codeOrOptions === "string"
        ? { code: codeOrOptions }
        : codeOrOptions;
    this.name = "BinanceApiError";
    this.code = options.code;
    this.status = options.status;
  }
}

export class BinanceCooldownError extends BinanceApiError {
  readonly activated: boolean;
  readonly retryAt: number;

  constructor(params: {
    code?: number | string;
    activated?: boolean;
    reason: string;
    retryAt: number;
    status?: number;
  }) {
    super(
      `Binance cooldown active until ${new Date(params.retryAt).toISOString()}: ${params.reason}`,
      {
        code: params.code,
        status: params.status,
      },
    );
    this.name = "BinanceCooldownError";
    this.activated = params.activated ?? false;
    this.retryAt = params.retryAt;
  }
}

let requestQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let cooldownState: BinanceCooldownState | null = null;
const usageByScope = new Map<string, BinanceUsageState>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCode(value: unknown): number | string | undefined {
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

function getErrorStatus(error: unknown): number | undefined {
  const status = Number(
    (error as any)?.status ?? (error as any)?.response?.status,
  );
  return Number.isFinite(status) ? status : undefined;
}

function getErrorCode(error: unknown): number | string | undefined {
  return normalizeCode(
    (error as any)?.response?.data?.code ?? (error as any)?.code,
  );
}

function getErrorMessage(error: unknown): string {
  return String(
    (error as any)?.response?.data?.msg ??
      (error as any)?.response?.data?.message ??
      (error as any)?.message ??
      "Binance rate limit reached",
  );
}

function getHeader(
  headers: unknown,
  name: string,
): string | number | undefined {
  if (!headers) return undefined;

  const axiosValue = (headers as any)?.get?.(name);
  if (axiosValue !== undefined && axiosValue !== null) return axiosValue;

  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === normalizedName) {
      return typeof value === "number" || typeof value === "string"
        ? value
        : undefined;
    }
  }

  return undefined;
}

/** Resolves a Retry-After header expressed as seconds or an HTTP date. */
function resolveRetryAfterMs(value: unknown, now: number): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + seconds * 1_000;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > now ? parsed : undefined;
}

/** Extracts Binance's epoch-millisecond `banned until` timestamp. */
function resolveBannedUntilMs(message: string): number | undefined {
  const match = message.match(/banned\s+until\s+(\d{10,})/i);
  if (!match) return undefined;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Returns true for Binance's IP rate-limit and automatic-ban responses. */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof BinanceCooldownError) return true;

  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  return status === 418 || status === 429 || Number(code) === -1003;
}

/** Returns true only for temporary transport failures and HTTP 5xx responses. */
function isRetryableRequestError(error: unknown): boolean {
  if (isRateLimitError(error)) return false;

  const status = getErrorStatus(error);
  if (status !== undefined) return status >= 500 && status <= 599;

  const code = String((error as any)?.code ?? "").toUpperCase();
  return [
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENETDOWN",
    "ENETUNREACH",
    "EPIPE",
    "ETIMEDOUT",
    "ERR_NETWORK",
  ].includes(code);
}

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Estimates Binance IP request weight for the REST calls used by this app. */
function estimateRequestWeight(
  descriptor: BinanceRequestDescriptor,
): number {
  const { endpoint, params = {} } = descriptor;

  if (endpoint === "/fapi/v1/klines") {
    const limit = normalizeLimit(params.limit, 500);
    if (limit < 100) return 1;
    if (limit < 500) return 2;
    if (limit <= 1_000) return 5;
    return 10;
  }

  if (endpoint === "/api/v3/klines" || endpoint === "/api/v1/klines") return 2;
  if (endpoint === "/api/v3/depth") {
    const limit = normalizeLimit(params.limit, 100);
    if (limit <= 100) return 5;
    if (limit <= 500) return 25;
    if (limit <= 1_000) return 50;
    return 250;
  }
  if (endpoint === "/api/v3/trades") return 25;
  if (endpoint === "/api/v3/aggTrades") return 4;
  if (endpoint === "/fapi/v1/ticker/24hr") return params.symbol ? 1 : 40;
  if (endpoint === "/api/v3/ticker/24hr") return params.symbol ? 2 : 80;
  if (endpoint === "/fapi/v1/premiumIndex") return params.symbol ? 1 : 10;
  if (endpoint === "/api/v3/account") return 20;
  if (endpoint === "/fapi/v1/openOrders") return params.symbol ? 1 : 40;
  if (endpoint === "/fapi/v2/balance") return 5;
  if (endpoint === "/fapi/v2/positionRisk") return 5;
  if (endpoint.startsWith("/sapi/")) return 10;
  return 1;
}

function getScope(domain: string): string {
  try {
    return new URL(domain).hostname.toLowerCase();
  } catch {
    return domain.toLowerCase();
  }
}

function getWeightLimit(domain: string): number {
  return getScope(domain).startsWith("fapi.") ? 2_400 : 6_000;
}

function getUsage(scope: string, now: number): BinanceUsageState {
  const windowStartMs = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const existing = usageByScope.get(scope);
  if (!existing || existing.windowStartMs !== windowStartMs) {
    const next = { usedWeight: 0, windowStartMs };
    usageByScope.set(scope, next);
    return next;
  }
  return existing;
}

function getActiveCooldown(now = Date.now()): BinanceCooldownState | null {
  if (!cooldownState || cooldownState.retryAt <= now) {
    cooldownState = null;
    return null;
  }
  return { ...cooldownState };
}

function assertAvailable(now = Date.now()): void {
  const active = getActiveCooldown(now);
  if (!active) return;

  throw new BinanceCooldownError({
    reason: active.reason,
    retryAt: active.retryAt,
  });
}

function activateCooldown(error: unknown, descriptor: BinanceRequestDescriptor) {
  if (!isRateLimitError(error)) return null;

  const now = Date.now();
  const message = getErrorMessage(error);
  const retryAfter = resolveRetryAfterMs(
    getHeader((error as any)?.response?.headers, "retry-after"),
    now,
  );
  const bannedUntil = resolveBannedUntilMs(message);
  const retryAt = Math.max(
    now + DEFAULT_COOLDOWN_MS,
    retryAfter ?? 0,
    bannedUntil ?? 0,
    cooldownState?.retryAt ?? 0,
  );
  const enteredOrExtended = !cooldownState || retryAt > cooldownState.retryAt;

  cooldownState = {
    reason: message,
    retryAt,
  };

  if (enteredOrExtended) {
    tradeLog.error("Binance REST cooldown activated", {
      endpoint: descriptor.endpoint,
      kind: descriptor.kind,
      reason: message,
      retryAt,
    });
  }

  return new BinanceCooldownError({
    activated: enteredOrExtended,
    code: getErrorCode(error),
    reason: message,
    retryAt,
    status: getErrorStatus(error),
  });
}

function observeResponse(
  descriptor: BinanceRequestDescriptor,
  response: AxiosResponse<unknown>,
): void {
  const header = getHeader(response.headers, "x-mbx-used-weight-1m");
  const usedWeight = Number(header);
  if (!Number.isFinite(usedWeight) || usedWeight < 0) return;

  const now = Date.now();
  const usage = getUsage(getScope(descriptor.domain), now);
  usage.usedWeight = Math.max(usage.usedWeight, usedWeight);
}

async function throttle(descriptor: BinanceRequestDescriptor): Promise<void> {
  assertAvailable();

  let now = Date.now();
  const scope = getScope(descriptor.domain);
  let usage = getUsage(scope, now);
  const weight = estimateRequestWeight(descriptor);
  const limit = getWeightLimit(descriptor.domain);
  let ratio = (usage.usedWeight + weight) / limit;

  if (ratio >= 0.9) {
    const nextWindowMs = usage.windowStartMs + MINUTE_MS + 50;
    await delay(Math.max(0, nextWindowMs - now));
    assertAvailable();
    now = Date.now();
    usage = getUsage(scope, now);
    ratio = (usage.usedWeight + weight) / limit;
  }

  const minimumGapMs =
    ratio >= 0.85
      ? CRITICAL_USAGE_REQUEST_GAP_MS
      : ratio >= 0.7
        ? HIGH_USAGE_REQUEST_GAP_MS
        : BASE_REQUEST_GAP_MS;
  const elapsed = now - lastRequestAt;
  if (elapsed < minimumGapMs) {
    await delay(minimumGapMs - elapsed);
    assertAvailable();
  }

  lastRequestAt = Date.now();
  getUsage(scope, lastRequestAt).usedWeight += weight;
}

/** Runs one public or private Binance REST call through the shared queue. */
async function run<T>(
  descriptor: BinanceRequestDescriptor,
  request: () => Promise<AxiosResponse<T>>,
): Promise<AxiosResponse<T>> {
  const result = requestQueue.then(async () => {
    await throttle(descriptor);
    try {
      const response = await request();
      observeResponse(descriptor, response);
      return response;
    } catch (error) {
      const cooldownError = activateCooldown(error, descriptor);
      throw cooldownError ?? error;
    }
  });

  requestQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function resetState(): void {
  requestQueue = Promise.resolve();
  lastRequestAt = 0;
  cooldownState = null;
  usageByScope.clear();
}

const binanceRequestCoordinator = {
  cooldown: {
    assertAvailable,
    get: getActiveCooldown,
  },
  error: {
    isRateLimit: isRateLimitError,
    isRetryable: isRetryableRequestError,
  },
  request: {
    run,
    weight: estimateRequestWeight,
  },
  state: {
    reset: resetState,
  },
} as const;

export default binanceRequestCoordinator;
