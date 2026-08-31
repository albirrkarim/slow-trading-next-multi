import { TradingMode } from "@/lib/exchange";
import type {
  Position,
  PositionAveragingState,
} from "@/lib/trading/models";

type TestClosedPosition = Omit<
  NonNullable<Position["closed"]>,
  "message"
> & {
  message?: string;
};

interface TestPositionOptions {
  account?: string;
  averaging?: PositionAveragingState;
  closed?: TestClosedPosition;
  direction?: Position["direction"];
  entryId?: string;
  entryLevel?: number;
  entryPrice?: number;
  entryTime?: number;
  executionMode?: Position["executionMode"];
  feature?: unknown;
  leverage?: number;
  marginUsdt?: number;
  netPct?: number;
  netUsdt?: number;
  notes?: string;
  notionalUsdt?: number;
  pnl?: Position["pnl"];
  quantity?: number;
  reason?: Position["opened"]["reason"];
  message?: string;
  source?: Position["opened"]["source"];
  symbol?: string;
  tradingMode?: TradingMode;
  vPoints?: Position["vPoints"];
}

export function createTestPosition(
  options: TestPositionOptions = {},
): Position {
  const entryLevel = options.entryLevel ?? -2;
  const marginUsdt = options.marginUsdt ?? options.notionalUsdt ?? 10;
  return {
    account: options.account ?? "binance-1",
    symbol: options.symbol ?? "SUI",
    executionMode: options.executionMode ?? "sandbox",
    tradingMode: options.tradingMode ?? TradingMode.FUTURES,
    direction: options.direction ?? "LONG",
    notes: options.notes,
    opened: {
      t: options.entryTime ?? 1,
      vPoint: {
        id: options.entryId ?? "B_TEST",
        lvl: entryLevel,
      },
      source: options.source,
      reason: options.reason ?? "COMMON",
      message: options.message ?? "[ENTRY] Test position",
      price: options.entryPrice ?? 10,
    },
    vPoints: options.vPoints,
    exposure: {
      quantity: options.quantity ?? 1,
      averageEntryPrice: options.entryPrice ?? 10,
      notionalUsdt: options.notionalUsdt ?? 10,
      marginUsdt,
      leverage: options.leverage ?? 1,
    },
    fees: { entryUsdt: 0 },
    strategy: {
      entry: { feature: options.feature },
      averaging:
        options.averaging ?? {
          entryLevel,
          lastHandledLevel: entryLevel,
          reserveBaseMarginUsdt: marginUsdt,
          reservedRemainingMarginUsdt: 0,
          steps: [],
        },
    },
    pnl: options.pnl ?? {
      netPct: options.netPct,
      netUsdt: options.netUsdt,
    },
    closed: options.closed
      ? {
          ...options.closed,
          message: options.closed.message ?? "[EXIT] Test position",
        }
      : undefined,
  };
}
