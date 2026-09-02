import type { VolatilityPoint } from "@/lib/dynamic";
import {
  DEFAULT_LONG_OPEN_POSITION_HOUR,
  DEFAULT_STALE_POSITION_HOUR,
  getNotificationTypeConfig,
  normalizeHighVolatilityMinAbsoluteLevel,
  normalizeLongOpenPositionHour,
  normalizeStalePositionHour,
  type DashboardNotificationConfig,
  type NotificationChannel,
} from "@/lib/notification/config";
import trading from "@/lib/trading";
import slowTradingStorage from "./storage";
import { findPositionTargetVolatilityPoint } from "./watch-reserve";
import type {
  SlowTradingMode,
  SlowTradingHighVolatilityZone,
  SlowTradingModeState,
  SlowTradingStorageData,
} from "./types";
import type { Position } from "@/lib/trading/models";
import { tradeLog } from "@/lib/trading/helper/log";
import type { BlackSwanState } from "@/lib/trading/black-swan";
import slowTradingDailyPerformance, {
  type SlowTradingDailyPerformanceReport,
} from "./daily-performance";
import type { DailyPnlLimitEvaluation } from "./daily-pnl-limit";
import { BinanceCooldownError } from "@/lib/exchange/platform/binance/request-coordinator";

const HOUR_MS = 60 * 60 * 1000;
const NOTIFICATION_CHANNELS: NotificationChannel[] = ["telegram", "email"];
let lastNotifiedBinanceCooldownRetryAt = 0;

export const STALE_POSITION_THRESHOLD_MS =
  DEFAULT_STALE_POSITION_HOUR * HOUR_MS;
export const LONG_OPEN_POSITION_THRESHOLD_MS =
  DEFAULT_LONG_OPEN_POSITION_HOUR * HOUR_MS;

interface HighVolatilityNotificationPayload {
  dedupeKey: string;
  message: string;
  title: string;
}

export interface SlowTradingManagementAction {
  action: "add" | "remove";
  reason: string;
  source: string;
  symbol: string;
  t?: number;
}

/** Builds the notification emitted when the current daily PnL entry stop is reached. */
export function buildSlowTradingDailyPnlLimitNotification(params: {
  currentTimeMs?: number;
  evaluation: DailyPnlLimitEvaluation;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
}): { message: string; title: string } {
  const modePrefix = params.mode === "sandbox" ? "[SANDBOX] " : "";
  return {
    title:
      `${modePrefix}[DAILY PNL ENTRY STOP] ` +
      formatSignedUsdt(params.evaluation.pnlUsdt),
    message: [
      `UTC day: ${params.evaluation.day}`,
      `Mode: ${params.mode}`,
      `Exchange: ${params.exchangeType}`,
      `Navbar USD PnL: ${formatSignedUsdt(params.evaluation.pnlUsdt)}`,
      `Auto-entry stop: ${formatSignedUsdt(params.evaluation.thresholdUsdt)}`,
      "Automatic entry: PAUSED",
      "Automatic exits and manual entries remain available.",
      `Time: ${new Date(params.currentTimeMs ?? Date.now()).toISOString()}`,
    ].join("\n"),
  };
}

/** Sends one notification per channel for each daily-PnL-limit breach transition. */
export async function notifySlowTradingDailyPnlLimit(params: {
  currentTimeMs?: number;
  evaluation: DailyPnlLimitEvaluation;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  modeState: SlowTradingModeState;
  notification: DashboardNotificationConfig;
}): Promise<boolean> {
  const state = params.modeState.dailyPnlLimitNotificationState ?? {};
  params.modeState.dailyPnlLimitNotificationState = state;

  if (!params.evaluation.reached) {
    let changed = false;
    for (const channel of NOTIFICATION_CHANNELS) {
      if (
        state[channel]?.d === params.evaluation.day &&
        state[channel]?.b
      ) {
        state[channel] = { b: false, d: params.evaluation.day };
        changed = true;
      }
    }
    return changed;
  }

  const content = buildSlowTradingDailyPnlLimitNotification(params);
  let changed = false;
  for (const channel of NOTIFICATION_CHANNELS) {
    const alreadyNotified =
      state[channel]?.d === params.evaluation.day && state[channel]?.b;
    if (
      alreadyNotified ||
      !getNotificationTypeConfig(
        params.notification,
        channel,
        "NOTIF_DAILY_PNL_LIMIT",
      )
    ) {
      continue;
    }

    try {
      await trading.notif.central({
        dashboard: "SLOW",
        channel,
        // PROD:NOTIF_DAILY_PNL_LIMIT
        key: "NOTIF_DAILY_PNL_LIMIT",
        dedupeKey: [
          "slow-daily-pnl-limit",
          channel,
          params.mode,
          params.evaluation.day,
          params.evaluation.pnlUsdt,
        ].join(":"),
        ...content,
      });
      state[channel] = { b: true, d: params.evaluation.day };
      changed = true;
    } catch (error) {
      tradeLog.error(
        `[slow-trading] failed to send ${channel} daily PnL entry-stop notification`,
        error,
      );
    }
  }

  return changed;
}

/** Sends one transition-level notification for portfolio crash protection. */
export async function notifySlowTradingBlackSwanAction(params: {
  forceExitSymbols?: string[];
  mode: SlowTradingMode;
  next: BlackSwanState;
  notification: DashboardNotificationConfig;
  previous: BlackSwanState;
}) {
  const stateChanged = params.previous.status !== params.next.status;
  const exits = Array.from(new Set(params.forceExitSymbols ?? []));
  if (!stateChanged && exits.length === 0) {
    return;
  }

  for (const channel of NOTIFICATION_CHANNELS) {
    if (
      !getNotificationTypeConfig(
        params.notification,
        channel,
        "NOTIF_BLACK_SWAN_ACTION",
      )
    ) {
      continue;
    }

    const btc = params.next.evidence?.btc;
    await trading.notif.central({
      dashboard: "SLOW",
      channel,
      // PROD:NOTIF_BLACK_SWAN_ACTION
      key: "NOTIF_BLACK_SWAN_ACTION",
      dedupeKey: [
        "slow-black-swan",
        channel,
        params.mode,
        params.next.status,
        params.next.since,
        exits.join(","),
      ].join(":"),
      title: `[BLACK SWAN] ${params.next.status} (${params.mode.toUpperCase()})`,
      message: [
        `State: ${params.previous.status} -> ${params.next.status}`,
        `Reason: ${params.next.reason}`,
        `BTC 5m: ${btc?.[5]?.pct?.toFixed(2) ?? "-"}%`,
        `BTC 15m: ${btc?.[15]?.pct?.toFixed(2) ?? "-"}%`,
        `BTC 60m: ${btc?.[60]?.pct?.toFixed(2) ?? "-"}%`,
        `Breadth: ${params.next.evidence?.breadth?.pct?.toFixed(1) ?? "-"}% (${params.next.evidence?.breadth?.affected ?? 0}/${params.next.evidence?.breadth?.valid ?? 0})`,
        `Emergency exits: ${exits.length > 0 ? exits.join(", ") : "none"}`,
        `Time: ${new Date(params.next.t).toISOString()}`,
      ].join("\n"),
    });
  }
}

function normalizeSymbol(symbol: string | undefined): string {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(/_USDT$/, "");
}

function formatElapsedHours(elapsedMs: number): string {
  return `${(elapsedMs / HOUR_MS).toFixed(2)} hours`;
}

function formatSignedUsdt(value: number): string {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatBalanceUsdt(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}

function formatDailyTitleDay(day: string): string {
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][Number(day.slice(5, 7)) - 1];

  return `${Number(day.slice(8, 10))} ${month ?? ""}`.trim();
}

function formatCompactPercent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** Builds the title and day-card fields for a daily performance notification. */
export function buildSlowTradingDailyPerformanceNotification(params: {
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  report: SlowTradingDailyPerformanceReport;
}): { message: string; title: string } {
  const { balance, day, trades } = params.report;
  const modePrefix = params.mode === "sandbox" ? "[SANDBOX]" : "";

  return {
    title:
      `${modePrefix}[DAILY] ${formatDailyTitleDay(day)} UTC | ` +
      `${formatSignedUsdt(trades.pnlUsdt)} | ` +
      `+$${trades.winningPnlUsdt.toFixed(2)} ` +
      `-$${Math.abs(trades.losingPnlUsdt).toFixed(2)} | ` +
      `WR ${formatCompactPercent(trades.winRate)} ` +
      `(${trades.wins}W / ${trades.losses}L)`,
    message: [
      `UTC day: ${day}`,
      `Mode: ${params.mode}`,
      `Exchange: ${params.exchangeType}`,
      `Trade PnL: ${formatSignedUsdt(trades.pnlUsdt)}`,
      `Trade PnL %: ${formatSignedPercent(trades.pnlPercent)}`,
      `Trades: ${trades.trades}`,
      `Wins: ${trades.wins}`,
      `Losses: ${trades.losses}`,
      `Win rate: ${trades.winRate.toFixed(2)}%`,
      `Balance PnL: ${balance.pnlUsdt === null ? "-" : formatSignedUsdt(balance.pnlUsdt)}`,
      `Balance PnL %: ${balance.pnlPercentOfStart === null ? "-" : formatSignedPercent(balance.pnlPercentOfStart)}`,
      `Start balance: ${formatBalanceUsdt(balance.startBalance)}`,
      `End balance: ${formatBalanceUsdt(balance.endBalance)}`,
    ].join("\n"),
  };
}

/** Sends the previous completed UTC day's performance once per enabled channel. */
export async function notifySlowTradingDailyPerformance(params: {
  currentTimeMs?: number;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  modeState: SlowTradingModeState;
  notification: DashboardNotificationConfig;
}): Promise<boolean> {
  const period = slowTradingDailyPerformance.report.getPreviousCompletedUtcDay(
    params.currentTimeMs,
  );
  const notificationState =
    params.modeState.dailyPerformanceNotificationState ?? {};
  params.modeState.dailyPerformanceNotificationState = notificationState;
  const pendingChannels = NOTIFICATION_CHANNELS.filter(
    (channel) =>
      notificationState[channel] !== period.day &&
      Boolean(
        getNotificationTypeConfig(
          params.notification,
          channel,
          "NOTIF_DAILY_PERFORMANCE",
        ),
      ),
  );

  if (pendingChannels.length === 0) {
    return false;
  }

  try {
    const [history, balanceSnapshots] = await Promise.all([
      slowTradingStorage.history.readRange({
        endTime: period.dayEndMs,
        mode: params.mode,
        startTime: period.dayStartMs,
      }),
      slowTradingStorage.balanceSnapshots.read(params.mode),
    ]);
    const report = slowTradingDailyPerformance.report.create({
      balanceSnapshots,
      currentTimeMs: params.currentTimeMs,
      history: history.map((position) => ({
        entryTime: position.opened.t,
        exitTime: position.closed?.t,
        netPnlPct: position.pnl.netPct,
        netProfitUSDT: position.pnl.netUsdt,
      })),
      startingBalanceUSDT:
        params.modeState.dynamicTradeMemory.startingBalanceUSDT,
    });
    const content = buildSlowTradingDailyPerformanceNotification({
      exchangeType: params.exchangeType,
      mode: params.mode,
      report,
    });
    let stateChanged = false;

    for (const channel of pendingChannels) {
      try {
        await trading.notif.central({
          dashboard: "SLOW",
          channel,
          // PROD:NOTIF_DAILY_PERFORMANCE
          key: "NOTIF_DAILY_PERFORMANCE",
          dedupeKey: [
            "slow-daily-performance",
            channel,
            params.mode,
            report.day,
          ].join(":"),
          ...content,
        });
        notificationState[channel] = report.day;
        stateChanged = true;
      } catch (error) {
        tradeLog.error(
          `[slow-trading] failed to send ${channel} daily performance notification`,
          error,
        );
      }
    }

    return stateChanged;
  } catch (error) {
    tradeLog.error(
      "[slow-trading] failed to build daily performance notification",
      error,
    );
    return false;
  }
}

/**
 * Builds symbol-management actions by comparing the configured list before and
 * after one mutation.
 */
export function buildSlowTradingManagementActions(params: {
  previousSymbols: string[];
  nextSymbols: string[];
  reason: string;
  source: string;
  t?: number;
}): SlowTradingManagementAction[] {
  const previousSymbols = new Set(
    params.previousSymbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean),
  );
  const nextSymbols = new Set(
    params.nextSymbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean),
  );
  const actions: SlowTradingManagementAction[] = [];

  for (const symbol of nextSymbols) {
    if (!previousSymbols.has(symbol)) {
      actions.push({
        action: "add",
        reason: params.reason,
        source: params.source,
        symbol,
        t: params.t,
      });
    }
  }

  for (const symbol of previousSymbols) {
    if (!nextSymbols.has(symbol)) {
      actions.push({
        action: "remove",
        reason: params.reason,
        source: params.source,
        symbol,
        t: params.t,
      });
    }
  }

  return actions;
}

/** Sends configured symbol-management actions to each eligible channel. */
export async function notifySlowTradingManagementActions(params: {
  actions: SlowTradingManagementAction[];
  notification: DashboardNotificationConfig;
}) {
  for (const action of params.actions) {
    const symbol = normalizeSymbol(action.symbol);
    if (!symbol) {
      continue;
    }

    const t = Number.isFinite(action.t) ? Number(action.t) : Date.now();

    for (const channel of NOTIFICATION_CHANNELS) {
      const typeConfig = getNotificationTypeConfig(
        params.notification,
        channel,
        "NOTIF_MANAGEMENT_ACTION",
      );
      if (!typeConfig) {
        continue;
      }

      const actionEnabled =
        action.action === "add"
          ? (typeConfig.params?.add ?? true)
          : (typeConfig.params?.remove ?? true);
      if (!actionEnabled) {
        continue;
      }

      await trading.notif.central({
        dashboard: "SLOW",
        channel,
        // PROD:NOTIF_MANAGEMENT_ACTION
        key: "NOTIF_MANAGEMENT_ACTION",
        dedupeKey: [
          "slow-management-action",
          channel,
          action.action,
          symbol,
          action.source,
          t,
        ].join(":"),
        title: `[MANAGEMENT] ${action.action.toUpperCase()} ${symbol}`,
        message: [
          `Action: ${action.action.toUpperCase()}`,
          `Symbol: ${symbol}`,
          `Source: ${action.source}`,
          `Reason: ${action.reason}`,
          `Time: ${new Date(t).toISOString()}`,
        ].join("\n"),
      });
    }
  }
}

/**
 * Gets high volatility zone from SLOW state or storage.
 */
function getHighVolatilityZone(
  level: number | undefined,
  minAbsoluteLevel: number,
): SlowTradingHighVolatilityZone | null {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return null;
  }

  if (Math.abs(level) < minAbsoluteLevel) {
    return null;
  }

  return level > 0 ? "POSITIVE" : "NEGATIVE";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown slow trading error";
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/**
 * Sends slow trading operational error notification when SLOW configuration allows it.
 */
export async function notifySlowTradingOperationalError(params: {
  source: string;
  error: unknown;
  details?: Record<string, unknown>;
}) {
  if (params.error instanceof BinanceCooldownError) {
    if (params.error.retryAt === lastNotifiedBinanceCooldownRetryAt) {
      return;
    }
    // PROD:BINANCE_GLOBAL_COOLDOWN
    lastNotifiedBinanceCooldownRetryAt = params.error.retryAt;
  }

  const errorMessage = getErrorMessage(params.error);
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));

  await slowTradingStorage.logs
    .appendError({
      source: params.source,
      error: params.error,
      details: params.details,
    })
    .catch((logError) => {
      tradeLog.error(
        "[slow-trading] failed to write operational error log",
        logError,
      );
    });

  try {
    await trading.notif.central({
      dashboard: "SLOW",
      // PROD:NOTIF_ERROR
      key: "NOTIF_ERROR",
      dedupeKey: [
        "slow-operational-error",
        params.source,
        errorMessage,
        hourBucket,
      ].join(":"),
      title: `[ERROR] ${params.source}`,
      message: JSON.stringify(
        {
          source: params.source,
          error: errorMessage,
          stack: getErrorStack(params.error),
          details: params.details,
        },
        null,
        2,
      ),
    });
  } catch (notificationError) {
    tradeLog.error(
      "[slow-trading] failed to send operational error notification",
      notificationError,
    );
  }
}

/**
 * Sends high volatility levels notification when SLOW configuration allows it.
 */
export async function notifyHighVolatilityLevels(params: {
  modeState: SlowTradingModeState;
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  notification: DashboardNotificationConfig;
}) {
  const { modeState, volatilityPointsMap, exchangeType, notification } =
    params;
  const nextState = { ...modeState.highVolatilityNotificationState };

  for (const channel of NOTIFICATION_CHANNELS) {
    const typeConfig = getNotificationTypeConfig(
      notification,
      channel,
      "NOTIF_HIGH_VOLATILITY",
    );

    if (!typeConfig) {
      nextState[channel] = {};
      continue;
    }

    const minAbsoluteLevel = normalizeHighVolatilityMinAbsoluteLevel(
      typeConfig.params?.level,
    );
    const channelState = {
      ...(modeState.highVolatilityNotificationState?.[channel] ?? {}),
    };
    const payloads: HighVolatilityNotificationPayload[] = [];

    for (const [rawSymbol, points] of Object.entries(volatilityPointsMap)) {
      const symbol = normalizeSymbol(rawSymbol);
      const latestPoint = points.at(-1);
      const zone = getHighVolatilityZone(
        latestPoint?.lvl,
        minAbsoluteLevel,
      );
      const previousZone = channelState[symbol] ?? null;

      if (!zone) {
        delete channelState[symbol];
      } else if (previousZone !== zone) {
        channelState[symbol] = zone;
      }

      if (!zone || previousZone === zone) {
        continue;
      }

      const level = latestPoint?.lvl ?? 0;
      const label = latestPoint?.l ?? "UNKNOWN";
      const price =
        typeof latestPoint?.p === "number" &&
        Number.isFinite(latestPoint.p)
          ? latestPoint.p.toFixed(6)
          : "-";
      const percentage =
        typeof latestPoint?.pct === "number" &&
        Number.isFinite(latestPoint.pct)
          ? `${latestPoint.pct.toFixed(2)}%`
          : "-";
      const time = latestPoint?.t ?? "-";

      payloads.push({
        dedupeKey: [
          "slow-high-volatility",
          channel,
          exchangeType,
          minAbsoluteLevel,
          symbol,
          latestPoint?.id ?? latestPoint?.t ?? "unknown-time",
          level,
          label,
        ].join(":"),
        title: `[VOL] ${symbol} level ${level} ${label}`,
        message: [
          `Symbol: ${symbol}`,
          `Exchange: ${exchangeType}`,
          `Threshold: abs(level) >= ${minAbsoluteLevel}`,
          `Level: ${level}`,
          `Label: ${label}`,
          `Price: ${price}`,
          `Move: ${percentage}`,
          `Time: ${time}`,
        ].join("\n"),
      });
    }

    nextState[channel] = channelState;

    for (const payload of payloads) {
      await trading.notif.central({
        dashboard: "SLOW",
        channel,
        // PROD:NOTIF_HIGH_VOLATILITY
        key: "NOTIF_HIGH_VOLATILITY",
        ...payload,
      });
    }
  }

  modeState.highVolatilityNotificationState = nextState;
}

/**
 * Sends one notification per configured channel when an open position outlives
 * that channel's stale threshold after its first post-entry target vPoint.
 */
export async function notifyStalePositions(params: {
  positions: Position[];
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  notification: DashboardNotificationConfig;
  currentTimeMs?: number;
}) {
  const currentTimeMs = params.currentTimeMs ?? Date.now();
  const pointsBySymbol = new Map(
    Object.entries(params.volatilityPointsMap).map(([symbol, points]) => [
      normalizeSymbol(symbol),
      points,
    ]),
  );

  for (const position of params.positions) {
    const symbol = normalizeSymbol(position.symbol);
    if (!symbol) {
      continue;
    }

    const points = pointsBySymbol.get(symbol) ?? [];
    const targetPoint = findPositionTargetVolatilityPoint({
      position,
      volatilityPoints: points,
    });

    if (!targetPoint || !Number.isFinite(targetPoint.t)) {
      continue;
    }

    const latestPoint = points.at(-1);
    const direction = position.direction ?? "LONG";
    const modePrefix = params.mode === "sandbox" ? "[SANDBOX] " : "";
    const elapsedMs = currentTimeMs - targetPoint.t;

    for (const channel of NOTIFICATION_CHANNELS) {
      const typeConfig = getNotificationTypeConfig(
        params.notification,
        channel,
        "NOTIF_STALE_POSITION",
      );
      if (!typeConfig) {
        continue;
      }

      const thresholdHour = normalizeStalePositionHour(
        typeConfig.params?.hour,
      );
      if (elapsedMs <= thresholdHour * HOUR_MS) {
        continue;
      }

      await trading.notif.central({
        dashboard: "SLOW",
        channel,
        // PROD:NOTIF_STALE_POSITION
        key: "NOTIF_STALE_POSITION",
        dedupeKey: [
          "slow-stale-position",
          channel,
          params.mode,
          params.exchangeType,
          symbol,
          position.opened.t ?? "unknown-entry",
          targetPoint.id ?? targetPoint.t,
        ].join(":"),
        title: `${modePrefix}[STALE POSITION] ${symbol} ${direction}`,
        message: [
          `Symbol: ${symbol}`,
          `Mode: ${params.mode}`,
          `Exchange: ${params.exchangeType}`,
          `Direction: ${direction}`,
          `Entry time: ${position.opened.t ?? "-"}`,
          `Target vPoint: ${targetPoint.l}${Math.abs(targetPoint.lvl)}`,
          `Target time: ${targetPoint.t}`,
          `Threshold: more than ${thresholdHour} hour${
            thresholdHour === 1 ? "" : "s"
          }`,
          `Stale for: ${formatElapsedHours(elapsedMs)}`,
          `Current vPoint: ${
            latestPoint
              ? `${latestPoint.l}${Math.abs(latestPoint.lvl)} at ${latestPoint.t}`
              : "-"
          }`,
        ].join("\n"),
      });
    }
  }
}

/**
 * Sends one notification per configured channel when a position remains open
 * longer than that channel's threshold after entry.
 */
export async function notifyLongOpenPositions(params: {
  positions: Position[];
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  notification: DashboardNotificationConfig;
  currentTimeMs?: number;
}) {
  const currentTimeMs = params.currentTimeMs ?? Date.now();

  for (const position of params.positions) {
    const symbol = normalizeSymbol(position.symbol);
    const entryTime = Number(position.opened.t);
    if (!symbol || !Number.isFinite(entryTime) || entryTime <= 0) {
      continue;
    }

    const elapsedMs = currentTimeMs - entryTime;
    const direction = position.direction ?? "LONG";
    const modePrefix = params.mode === "sandbox" ? "[SANDBOX] " : "";

    for (const channel of NOTIFICATION_CHANNELS) {
      const typeConfig = getNotificationTypeConfig(
        params.notification,
        channel,
        "NOTIF_LONG_OPEN_POSITION",
      );
      if (!typeConfig) {
        continue;
      }

      const thresholdHour = normalizeLongOpenPositionHour(
        typeConfig.params?.hour,
      );
      if (elapsedMs <= thresholdHour * HOUR_MS) {
        continue;
      }

      await trading.notif.central({
        dashboard: "SLOW",
        channel,
        // PROD:NOTIF_LONG_OPEN_POSITION
        key: "NOTIF_LONG_OPEN_POSITION",
        dedupeKey: [
          "slow-long-open-position",
          channel,
          params.mode,
          params.exchangeType,
          symbol,
          position.opened.vPoint.id ?? "unknown-entry-id",
          entryTime,
        ].join(":"),
        title: `${modePrefix}[LONG OPEN POSITION] ${symbol} ${direction}`,
        message: [
          `Symbol: ${symbol}`,
          `Mode: ${params.mode}`,
          `Exchange: ${params.exchangeType}`,
          `Direction: ${direction}`,
          `Entry time: ${new Date(entryTime).toISOString()}`,
          `Threshold: more than ${thresholdHour} hour${
            thresholdHour === 1 ? "" : "s"
          }`,
          `Open for: ${formatElapsedHours(elapsedMs)}`,
          `Margin: ${
            typeof position.exposure.marginUsdt === "number" &&
            Number.isFinite(position.exposure.marginUsdt)
              ? `$${position.exposure.marginUsdt.toFixed(2)}`
              : "-"
          }`,
        ].join("\n"),
      });
    }
  }
}

/** Sends all post-exit notifications for positions that remain open. */
export async function notifyOpenPositionMonitors(params: {
  positions: Position[];
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  exchangeType: SlowTradingStorageData["config"]["exchangeType"];
  mode: SlowTradingMode;
  notification: DashboardNotificationConfig;
  currentTimeMs?: number;
}) {
  const failures: unknown[] = [];

  try {
    await notifyStalePositions(params);
  } catch (error) {
    failures.push(error);
  }

  try {
    await notifyLongOpenPositions(params);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    throw failures[0];
  }
}

/**
 * Grouped notification API for SLOW operational notifications.
 */
const slowTradingNotifications = {
  blackSwanAction: {
    notify: notifySlowTradingBlackSwanAction,
  },
  dailyPerformance: {
    build: buildSlowTradingDailyPerformanceNotification,
    notify: notifySlowTradingDailyPerformance,
  },
  dailyPnlLimit: {
    build: buildSlowTradingDailyPnlLimitNotification,
    notify: notifySlowTradingDailyPnlLimit,
  },
  highVolatility: {
    notify: notifyHighVolatilityLevels,
  },
  managementAction: {
    build: buildSlowTradingManagementActions,
    notify: notifySlowTradingManagementActions,
  },
  openPositions: {
    notify: notifyOpenPositionMonitors,
  },
  operationalError: {
    notify: notifySlowTradingOperationalError,
  },
  stalePosition: {
    notify: notifyStalePositions,
  },
  notifyHighVolatilityLevels,
  notifyLongOpenPositions,
  notifySlowTradingManagementActions,
  notifyOpenPositionMonitors,
  notifySlowTradingOperationalError,
  notifyStalePositions,
} as const;

export default slowTradingNotifications;
export { slowTradingNotifications };
