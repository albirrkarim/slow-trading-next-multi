import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic/constants";
import slowTradingAccountConfig from "@/lib/slowTrading/account-config";
import type { SlowTradingAccountTradingConfig } from "@/lib/slowTrading/types";

type SummaryRecord = Record<string, unknown>;

const NO_CHANGE = Symbol("NO_CHANGE");
const DEFAULT_ACCOUNT_TRADING_CONFIG: SlowTradingAccountTradingConfig = {
  ...slowTradingAccountConfig.trading.fromEffectiveConfig(
    DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
  ),
  enableWatchLogic: false,
  maxEntryMargin: 0,
  maxEntryMarginPct: 0,
  maxLeverage: 0,
  watchMaxNextAveragingLevels: 2,
  watchReserveLevels: 2,
  watchReservePctAlloc: 2,
};

function isRecord(value: unknown): value is SummaryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns whether two trading-config values are structurally equal. */
function isEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => isEqual(value, right[index]))
    );
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).filter(
      (key) => left[key] !== undefined,
    );
    const rightKeys = Object.keys(right).filter(
      (key) => right[key] !== undefined,
    );
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) => Object.hasOwn(right, key) && isEqual(left[key], right[key]),
      )
    );
  }

  return false;
}

/** Copies a JSON-compatible summary value without retaining account state. */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, copyValue(child)]),
    );
  }
  return value;
}

/** Recursively removes values that are equal to their production defaults. */
function getChangedValue(
  value: unknown,
  defaultValue: unknown,
): unknown | typeof NO_CHANGE {
  if (isEqual(value, defaultValue)) return NO_CHANGE;

  if (isRecord(value) && isRecord(defaultValue)) {
    const changed = Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        if (child === undefined) return [];
        const changedChild = getChangedValue(child, defaultValue[key]);
        return changedChild === NO_CHANGE ? [] : [[key, changedChild]];
      }),
    );
    return Object.keys(changed).length > 0 ? changed : NO_CHANGE;
  }

  return copyValue(value);
}

/** Builds the display-only account config containing only custom values. */
export function getCustomAccountTradingConfig(
  trading: SlowTradingAccountTradingConfig,
): SummaryRecord {
  const { notes: _notes, ...tradingValues } = trading;
  const { notes: _defaultNotes, ...defaultValues } =
    DEFAULT_ACCOUNT_TRADING_CONFIG;
  const changed = getChangedValue(tradingValues, defaultValues);
  return changed === NO_CHANGE ? {} : (changed as SummaryRecord);
}
