import type { DynamicTradeConfig } from "@/lib/dynamic";
import type {
  SlowTradingAccount,
  SlowTradingAccountTradingConfig,
  SlowTradingPersistedSharedConfig,
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
  notes = "",
): SlowTradingAccountTradingConfig {
  const trading = {
    notes: typeof notes === "string" ? notes : "",
  } as SlowTradingAccountTradingConfig;

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
  const tradingConfig = clone(account.trading) as Partial<
    SlowTradingAccountTradingConfig
  >;
  delete tradingConfig.notes;

  return {
    ...clone(sharedConfig),
    ...tradingConfig,
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
    trading: fromEffectiveConfig(config, account.trading.notes),
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

/** Selects only config.json-owned fields from a complete effective config. */
function toPersistedSharedConfig(
  config: DynamicTradeConfig,
): SlowTradingPersistedSharedConfig {
  const persisted: SlowTradingPersistedSharedConfig = {
    name: config.name,
    description: config.description,
    symbols: clone(config.symbols),
    modelConfig: {
      minimalAssetOnTrade: config.modelConfig.minimalAssetOnTrade,
      safePercentPerMonth: config.modelConfig.safePercentPerMonth,
      safeUSDTPerMonth: config.modelConfig.safeUSDTPerMonth,
    },
    exchangeType: config.exchangeType,
    tradingMode: config.tradingMode,
  };

  if (config.decisionEngineVersion !== undefined) {
    persisted.decisionEngineVersion = config.decisionEngineVersion;
  }
  if (config.blackSwan !== undefined) {
    persisted.blackSwan = clone(config.blackSwan);
  }

  return persisted;
}

const slowTradingAccountConfig = {
  shared: {
    fromEffectiveConfig: sharedFromEffectiveConfig,
    toPersistedConfig: toPersistedSharedConfig,
  },
  trading: {
    fromEffectiveConfig,
    toEffectiveConfig,
    withEffectiveConfig,
  },
} as const;

export default slowTradingAccountConfig;
