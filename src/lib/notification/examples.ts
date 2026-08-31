import {
  DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL,
  DEFAULT_LONG_OPEN_POSITION_HOUR,
  DEFAULT_STALE_POSITION_HOUR,
  type NotificationTypeConfig,
  type SlowNotificationKey,
} from "./config";

export interface NotificationExample {
  message: string;
  title: string;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Builds representative content using the notification type's current parameters. */
function get(
  type: SlowNotificationKey,
  params?: NotificationTypeConfig["params"],
): NotificationExample {
  switch (type) {
    case "NOTIF_ENTRY":
      return {
        title:
          "[SANDBOX] [ENTRY] | SOL LONG | USDT: $40.00 @ Price: $145.25000 | Quantity: 0.275 | Leverage: 5x | binance:futures",
        message: json({
          modelDecision: {
            action: "BUY",
            direction: "LONG",
            price: 145.25,
            quantity: 0.275,
            symbol: "SOL",
          },
          sandbox: true,
        }),
      };
    case "NOTIF_ENTRY_FAILED":
      return {
        title: "BUY ORDER FAILED",
        message: json({
          buyParam: {
            side: "BUY",
            symbol: "SOL_USDT",
            type: "MARKET",
          },
          error: "Insufficient margin for this order.",
        }),
      };
    case "NOTIF_EXIT":
      return {
        title:
          "[SANDBOX] [SELL] | SOL LONG | Profit: $1.20 | USDT Profit: $1.12 | Entry: $145.25000 Current: $149.61000 | Gain: 3.00%",
        message: json({
          modelDecision: {
            action: "SELL",
            price: 149.61,
            profit: 0.03,
            symbol: "SOL",
          },
          sandbox: true,
        }),
      };
    case "NOTIF_EXIT_FAILED":
      return {
        title: "EXIT ORDER FAILED",
        message: json({
          error: "Exchange did not confirm that the position was closed.",
          exitParam: {
            reduceOnly: true,
            side: "SELL",
            symbol: "SOL_USDT",
          },
        }),
      };
    case "NOTIF_AVERAGE":
      return {
        title:
          "[SANDBOX] [ADD POSITION] | SOL LONG | Level 2 | Margin: $12.00 @ $139.80000",
        message: json({
          nextStep: { level: 2, marginUsdt: 12 },
          sandbox: true,
          spendStep: { price: 139.8, quantity: 0.429 },
        }),
      };
    case "NOTIF_AVERAGE_FAILED":
      return {
        title: "AVERAGING ORDER FAILED",
        message: json({
          error: "Order rejected by exchange.",
          nextStep: { level: 2, marginUsdt: 12 },
        }),
      };
    case "NOTIF_HIGH_VOLATILITY": {
      const level = params?.level ?? DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL;
      return {
        title: `[VOL] SOL level ${level} T`,
        message: [
          "Symbol: SOL",
          "Exchange: binance",
          `Threshold: abs(level) >= ${level}`,
          `Level: ${level}`,
          "Label: T",
          "Price: 149.610000",
          "Move: 8.42%",
          "Time: 2026-08-10T10:15:00.000Z",
        ].join("\n"),
      };
    }
    case "NOTIF_STALE_POSITION": {
      const hour = params?.hour ?? DEFAULT_STALE_POSITION_HOUR;
      return {
        title: "[SANDBOX] [STALE POSITION] SOL LONG",
        message: [
          "Symbol: SOL",
          "Mode: sandbox",
          "Exchange: binance",
          "Direction: LONG",
          "Entry time: 2026-08-10T08:00:00.000Z",
          "Target vPoint: T2",
          "Target time: 2026-08-10T09:00:00.000Z",
          `Threshold: more than ${hour} hour${hour === 1 ? "" : "s"}`,
          `Stale for: ${(hour + 0.25).toFixed(2)} hours`,
          "Current vPoint: T1 at 2026-08-10T10:15:00.000Z",
        ].join("\n"),
      };
    }
    case "NOTIF_LONG_OPEN_POSITION": {
      const hour = params?.hour ?? DEFAULT_LONG_OPEN_POSITION_HOUR;
      return {
        title: "[SANDBOX] [LONG OPEN POSITION] SOL LONG",
        message: [
          "Symbol: SOL",
          "Mode: sandbox",
          "Exchange: binance",
          "Direction: LONG",
          "Entry time: 2026-08-09T08:00:00.000Z",
          `Threshold: more than ${hour} hour${hour === 1 ? "" : "s"}`,
          `Open for: ${(hour + 0.5).toFixed(2)} hours`,
          "Margin: $40.00",
        ].join("\n"),
      };
    }
    case "NOTIF_MANAGEMENT_ACTION":
      return {
        title: "[MANAGEMENT] REMOVE IOTX",
        message: [
          "Action: REMOVE",
          "Symbol: IOTX",
          "Source: management-cycle.auto-remove",
          "Reason: Market cap $88.40M is below configured minimum $100.00M.",
          "Time: 2026-08-10T10:15:00.000Z",
        ].join("\n"),
      };
    case "NOTIF_BLACK_SWAN_ACTION":
      return {
        title: "[BLACK SWAN] CRISIS (SANDBOX)",
        message: [
          "State: NORMAL -> CRISIS",
          "Reason: SYSTEMIC_BREADTH",
          "BTC 5m: -4.11%",
          "BTC 15m: -5.31%",
          "BTC 60m: -6.96%",
          "Breadth: 88.9% (8/9)",
          "Emergency exits: AAVE, APT, SOL",
          "Time: 2026-08-10T10:15:00.000Z",
        ].join("\n"),
      };
    case "NOTIF_DAILY_PNL_LIMIT":
      return {
        title: "[SANDBOX] [DAILY PNL ENTRY STOP] -$51.25",
        message: [
          "UTC day: 2026-08-10",
          "Mode: sandbox",
          "Exchange: binance",
          "Navbar USD PnL: -$51.25",
          "Auto-entry stop: -$50.00",
          "Automatic entry: PAUSED",
          "Automatic exits and manual entries remain available.",
          "Time: 2026-08-10T10:15:00.000Z",
        ].join("\n"),
      };
    case "NOTIF_DAILY_PERFORMANCE":
      return {
        title:
          "[SANDBOX][DAILY] 10 Aug UTC | +$7.00 | +$9.00 -$2.00 | WR 50% (1W / 1L)",
        message: [
          "UTC day: 2026-08-10",
          "Mode: sandbox",
          "Exchange: binance",
          "Trade PnL: +$7.00",
          "Trade PnL %: +1.00%",
          "Trades: 2",
          "Wins: 1",
          "Losses: 1",
          "Win rate: 50.00%",
          "Balance PnL: +$4.53",
          "Balance PnL %: +0.45%",
          "Start balance: $1000.00",
          "End balance: $1004.53",
        ].join("\n"),
      };
    case "NOTIF_ERROR":
      return {
        title: "[ERROR] management-cycle",
        message: json({
          details: { symbol: "SOL" },
          error: "Market data request timed out.",
          source: "management-cycle",
          stack: "Error: Market data request timed out.",
        }),
      };
    default: {
      const unsupportedType: never = type;
      throw new Error(`Unsupported notification type: ${unsupportedType}`);
    }
  }
}

const notificationExamples = { get } as const;

export default notificationExamples;
