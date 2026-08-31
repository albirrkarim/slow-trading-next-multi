import type { DynamicTradeConfig } from "@/lib/dynamic";
import type {
  SlowTradingAccount,
  SlowTradingAccountTradingConfig,
} from "./types";
import { clone } from "./storage/common";

const TRADING_CONFIG_KEYS = [
  "adaptiveAveraging",
  "averagingRescueProjectionGuardEnabled",
  "enableWatchLogic",
  "exactLeverage",
  "exitSidewaysToFreeWorkersForStrongCandidates",
  "maxEntryBased24HourVolPct",
  "maxEntryMargin",
  "maxEntryMarginPct",
  "maxLeverage",
  "maxOpenPositions",
  "minActionableAbsoluteLevel",
  "watchMaxNextAveragingLevels",
  "watchReserveLevels",
  "watchReservePctAlloc",
] as const satisfies ReadonlyArray<keyof SlowTradingAccountTradingConfig>;

const SHARED_MODEL_CONFIG_KEYS = [
  "minimalAssetOnTrade",
  "safePercentPerMonth",
  "safeUSDTPerMonth",
] as const;

const SHARED_CONFIG_KEYS = [
  "blackSwan",
  "decisionEngineVersion",
  "description",
  "exchangeType",
  "name",
  "symbols",
  "tradingMode",
] as const satisfies ReadonlyArray<keyof DynamicTradeConfig>;

/** Extracts exactly the settings owned by the Trading tab. */
function fromEffectiveConfig(
  config: DynamicTradeConfig,
): SlowTradingAccountTradingConfig {
  const trading = {} as SlowTradingAccountTradingConfig;

  for (const key of TRADING_CONFIG_KEYS) {
    const value = config[key];
    if (value !== undefined) {
      Object.assign(trading, { [key]: clone(value) });
    }
  }

  const modelConfig = { ...clone(config.modelConfig) };
  for (const key of SHARED_MODEL_CONFIG_KEYS) {
    delete modelConfig[key];
  }
  trading.modelConfig = modelConfig;

  return trading;
}

/** Overlays one account's Trading-tab settings onto the shared SLOW config. */
function toEffectiveConfig(
  sharedConfig: DynamicTradeConfig,
  account: Pick<SlowTradingAccount, "trading">,
): DynamicTradeConfig {
  return {
    ...clone(sharedConfig),
    ...clone(account.trading),
    modelConfig: {
      ...clone(sharedConfig.modelConfig),
      ...clone(account.trading.modelConfig),
    },
  };
}

/** Replaces only the per-account Trading-tab settings from an effective config. */
function withEffectiveConfig(
  account: SlowTradingAccount,
  config: DynamicTradeConfig,
): SlowTradingAccount {
  return {
    ...account,
    trading: fromEffectiveConfig(config),
    updatedAt: Date.now(),
  };
}

/** Replaces only settings owned by shared Management/Black-Swan config. */
function sharedFromEffectiveConfig(
  currentShared: DynamicTradeConfig,
  effectiveConfig: DynamicTradeConfig,
): DynamicTradeConfig {
  const next = clone(currentShared);
  for (const key of SHARED_CONFIG_KEYS) {
    const value = effectiveConfig[key];
    if (value === undefined) {
      delete next[key];
    } else {
      Object.assign(next, { [key]: clone(value) });
    }
  }
  for (const key of SHARED_MODEL_CONFIG_KEYS) {
    const value = effectiveConfig.modelConfig[key];
    if (value === undefined) {
      delete next.modelConfig[key];
    } else {
      Object.assign(next.modelConfig, { [key]: clone(value) });
    }
  }
  return next;
}

const slowTradingAccountConfig = {
  shared: {
    fromEffectiveConfig: sharedFromEffectiveConfig,
  },
  trading: {
    fromEffectiveConfig,
    toEffectiveConfig,
    withEffectiveConfig,
  },
} as const;

export default slowTradingAccountConfig;
