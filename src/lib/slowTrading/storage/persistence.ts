import { FILES } from "@/components/storage";
import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic";
import {
  createNotificationTypeConfig,
  createDefaultDashboardNotificationConfig,
  normalizeDashboardNotificationConfig,
} from "@/lib/notification/config";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";
import blackSwan from "@/lib/trading/black-swan";
import fs from "fs-extra";
import {
  createDefaultSlowTradingAccounts,
  loadSlowTradingExchangeAccounts,
  normalizeExchangeAccountSlug,
  saveSlowTradingExchangeAccounts,
} from "./account";
import slowTradingAccountConfig from "../account-config";
import { clone, uniqueSymbols } from "./common";
import {
  DEFAULT_EXCHANGE_ACCOUNT_SLUG,
  DEFAULT_SAFE_HAVEN_CONFIG,
  DEFAULT_SANDBOX_INITIAL_BALANCE,
  DEFAULT_WITHDRAWAL_CONFIG,
} from "./constants";
import slowTradingJsonFile from "./json-file";
import {
  hydrateSlowTradingHistoryFromFiles,
  migrateInlineClosedPositionsToHistoryFiles,
  migrateLegacyHistoryRoot,
  persistClosedPositionsToHistoryFiles,
  stripClosedPositionsFromModeMemory,
  stripClosedPositionsFromMemory,
} from "./history-files";
import type {
  SlowTradingConfigFileData,
  SlowTradingMemoryFileData,
} from "./internal-types";
import { appendSlowTradingSafeHavenLog } from "./logs";
import {
  applySlowTradingSafeHavenUpdate,
  createDefaultModeStates,
  createModeState,
  ensureTradeSettings,
  getActiveSlowTradingMode,
} from "./mode";
import { normalizeWithdrawalConfig } from "./withdrawal-config";
import { normalizeSafeHavenConfig } from "./safe-haven-config";
import { DEFAULT_MCP_CONFIG, normalizeMcpConfig } from "./mcp-config";
import type {
  SlowTradingMode,
  SlowTradingStorageData,
  SlowTradingStorageUpdateInput,
} from "../types";
import slowTradingPnlHistory from "../pnl-history";
import slowTradingStages from "../stages";
import slowTradingDailyPnlLimit from "../daily-pnl-limit";

const DEFAULT_AUTO_REMOVE_SYMBOL_MIN_VPOINT_PCT = 15;

/** Enables the new daily-PnL notification once for configs predating its threshold field. */
function normalizeRuntimeNotification(
  value: unknown,
  enableDailyPnlLimitByDefault: boolean,
): SlowTradingStorageData["runtime"]["notification"] {
  const notification = normalizeDashboardNotificationConfig(value, "SLOW");
  if (!enableDailyPnlLimitByDefault) {
    return notification;
  }

  for (const channel of ["telegram", "email"] as const) {
    if (
      !notification[channel].types.some(
        (item) => item.id === "NOTIF_DAILY_PNL_LIMIT",
      )
    ) {
      notification[channel].types.push(
        createNotificationTypeConfig("NOTIF_DAILY_PNL_LIMIT"),
      );
    }
  }

  return notification;
}

interface LoadSlowTradingStorageOptions {
  /** Project config and mode memory for this account instead of UI selection. */
  account?: string;
  /** Hydrate closed trade history from split files into positionsSell. */
  includeHistory?: boolean;
  /** Load every mode or only the active mode needed by runner/runtime paths. */
  modeScope?: "all" | "active";
}

/**
 * Create the default SLOW strategy config without allocating mode memory.
 */
function createDefaultSlowTradingConfig(): SlowTradingStorageData["config"] {
  const symbols = uniqueSymbols(
    DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION.symbols,
  );

  return {
    ...clone(DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION),
    symbols,
    blackSwan: blackSwan.config.normalize(
      DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION.blackSwan,
    ),
  };
}

/** Applies newly introduced exit defaults without restoring intentionally omitted legacy fields. */
function normalizeExitModelConfigDefaults(
  value: SlowTradingStorageData["config"]["modelConfig"] | undefined,
  defaults: SlowTradingStorageData["config"]["modelConfig"],
): SlowTradingStorageData["config"]["modelConfig"] {
  if (!value) {
    return clone(defaults);
  }

  return {
    ...value,
    exitOnVPointAbsLevel:
      value.exitOnVPointAbsLevel ?? defaults.exitOnVPointAbsLevel,
    stopLossUSDT: value.stopLossUSDT ?? defaults.stopLossUSDT,
  };
}

/**
 * Create the default SLOW runtime config without allocating mode memory.
 */
function createDefaultSlowTradingRuntime(): SlowTradingStorageData["runtime"] {
  const exchangeAccounts = createDefaultSlowTradingAccounts(
    createDefaultSlowTradingConfig(),
  );
  const account = exchangeAccounts[0];
  return {
    exchangeAccountSlug: account?.slug ?? DEFAULT_EXCHANGE_ACCOUNT_SLUG,
    exchangeAccounts,
    runnerEnabled: false,
    autoEntryEnabled: false,
    autoEntryDailyPnlLimitUSDT:
      slowTradingDailyPnlLimit.config.defaultThresholdUsdt,
    autoExitEnabled: false,
    entrySignalBypass: false,
    autoRemoveSymbolAbsLevel: 0,
    autoRemoveSymbolMinMarketCapUSD: 0,
    autoRemoveSymbolMinPrice: 0,
    autoRemoveSymbolMinVPointPct:
      DEFAULT_AUTO_REMOVE_SYMBOL_MIN_VPOINT_PCT,
    pnlHistoryBucketMinutes:
      slowTradingPnlHistory.bucket.defaultMinutes,
    blackSwanStageIntervalMinutes:
      slowTradingStages.interval.defaults["risk-sentinel"],
    speedupStageIntervalMinutes:
      slowTradingStages.interval.defaults.speedup,
    speedupStagePositivePnlThresholdPct:
      slowTradingStages.position.speedupThreshold.defaults.positivePct,
    speedupStageNegativePnlThresholdPct:
      slowTradingStages.position.speedupThreshold.defaults.negativePct,
    speedupStageTakeProfitOffsetPct:
      slowTradingStages.position.speedupThreshold.defaults.takeProfitOffsetPct,
    standardMonitoringStageIntervalMinutes:
      slowTradingStages.interval.defaults["standard-monitoring"],
    managementStageIntervalMinutes:
      slowTradingStages.interval.defaults.management,
    captureEntryStageIntervalMinutes:
      slowTradingStages.interval.defaults["capture-entry"],
    notification: createDefaultDashboardNotificationConfig("SLOW"),
    sandboxEnabled: account?.sandbox.enabled ?? false,
    sandboxInitialBalanceUSDT:
      account?.sandbox.initialBalanceUSDT ?? DEFAULT_SANDBOX_INITIAL_BALANCE,
    withdrawal: clone(DEFAULT_WITHDRAWAL_CONFIG),
    safeHaven: clone(DEFAULT_SAFE_HAVEN_CONFIG),
    mcp: clone(DEFAULT_MCP_CONFIG),
  };
}

/**
 * Ensures the selected exchange account slug exists in the saved account list.
 */
function ensureExchangeAccountSelection(
  runtime: SlowTradingStorageData["runtime"],
): SlowTradingStorageData["runtime"] {
  const accountExists = runtime.exchangeAccounts.some(
    (account) => account.slug === runtime.exchangeAccountSlug,
  );
  if (accountExists) {
    return runtime;
  }

  return {
    ...runtime,
    exchangeAccountSlug:
      runtime.exchangeAccounts[0]?.slug ?? DEFAULT_EXCHANGE_ACCOUNT_SLUG,
  };
}

/**
 * Normalize the symbol auto-removal threshold.
 */
function normalizeAutoRemoveSymbolAbsLevel(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

/**
 * Normalize the minimum market price used by coin auto-removal and entry guard.
 */
function normalizeAutoRemoveSymbolMinPrice(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

/** Normalize the minimum USD market cap used by coin auto-removal. */
function normalizeAutoRemoveSymbolMinMarketCapUSD(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

/** Normalize the stored-vPoint percent threshold used by coin auto-removal. */
function normalizeAutoRemoveSymbolMinVPointPct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUTO_REMOVE_SYMBOL_MIN_VPOINT_PCT;
  }

  return Math.max(0, parsed);
}

/**
 * Normalize the portfolio-wide open-position entry limit.
 */
function normalizeMaxOpenPositions(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

/** Applies defaults and bounds to production stage runtime settings. */
function normalizeStageRuntimeConfig(
  runtime: SlowTradingStorageData["runtime"],
): void {
  runtime.blackSwanStageIntervalMinutes =
    slowTradingStages.interval.normalizeMinutes(
      runtime.blackSwanStageIntervalMinutes,
      slowTradingStages.interval.defaults["risk-sentinel"],
    );
  runtime.speedupStageIntervalMinutes =
    slowTradingStages.interval.normalizeMinutes(
      runtime.speedupStageIntervalMinutes,
      slowTradingStages.interval.defaults.speedup,
    );
  runtime.standardMonitoringStageIntervalMinutes =
    slowTradingStages.interval.normalizeMinutes(
      runtime.standardMonitoringStageIntervalMinutes,
      slowTradingStages.interval.defaults["standard-monitoring"],
    );
  runtime.managementStageIntervalMinutes =
    slowTradingStages.interval.normalizeMinutes(
      runtime.managementStageIntervalMinutes,
      slowTradingStages.interval.defaults.management,
    );
  runtime.captureEntryStageIntervalMinutes =
    slowTradingStages.interval.normalizeMinutes(
      runtime.captureEntryStageIntervalMinutes,
      slowTradingStages.interval.defaults["capture-entry"],
    );
  runtime.speedupStagePositivePnlThresholdPct =
    slowTradingStages.position.speedupThreshold.normalizePct(
      runtime.speedupStagePositivePnlThresholdPct,
      slowTradingStages.position.speedupThreshold.defaults.positivePct,
    );
  runtime.speedupStageNegativePnlThresholdPct =
    slowTradingStages.position.speedupThreshold.normalizePct(
      runtime.speedupStageNegativePnlThresholdPct,
      slowTradingStages.position.speedupThreshold.defaults.negativePct,
    );
  runtime.speedupStageTakeProfitOffsetPct =
    slowTradingStages.position.speedupThreshold.normalizePct(
      runtime.speedupStageTakeProfitOffsetPct,
      slowTradingStages.position.speedupThreshold.defaults.takeProfitOffsetPct,
    );
}

/**
 * Create the default persisted storage shape for slow trading.
 *
 * @returns Fresh storage object with live and sandbox mode state.
 */
export function createDefaultSlowTradingStorage(): SlowTradingStorageData {
  const sharedConfig = createDefaultSlowTradingConfig();
  const runtime = createDefaultSlowTradingRuntime();
  const account = runtime.exchangeAccounts[0];
  if (!account) {
    throw new Error("SLOW requires at least one exchange account");
  }
  const config = slowTradingAccountConfig.trading.toEffectiveConfig(
    sharedConfig,
    account,
  );

  return {
    account,
    sharedConfig,
    config,
    runtime,
    modes: createDefaultModeStates(config.symbols),
    updatedAt: Date.now(),
  };
}

/**
 * Normalizes a persisted mode only when the caller needs it in memory.
 */
function loadModeStateForScope(params: {
  accountSlug: string;
  mode: SlowTradingMode;
  activeMode: SlowTradingMode;
  memoryRaw: Partial<SlowTradingMemoryFileData>;
  modeScope: "all" | "active";
  sandboxInitialBalanceUSDT: number;
  symbols: string[];
}): SlowTradingStorageData["modes"][SlowTradingMode] {
  const initialBalanceUSDT =
    params.mode === "sandbox" ? params.sandboxInitialBalanceUSDT : 0;

  if (params.modeScope === "active" && params.mode !== params.activeMode) {
    return createModeState(initialBalanceUSDT);
  }

  return ensureTradeSettings(
    {
      ...createModeState(initialBalanceUSDT),
      ...(params.memoryRaw.accounts?.[params.accountSlug]?.[params.mode] ??
        params.memoryRaw.modes?.[params.mode] ??
        {}),
    },
    params.symbols,
  );
}

/**
 * Split the full slow-trading storage object into config/runtime and mode-memory files.
 *
 * @param storage - Full slow-trading storage state.
 * @returns Persistable config and memory payloads.
 */
function splitSlowTradingStorage(
  storage: SlowTradingStorageData,
  memoryRaw: Partial<SlowTradingMemoryFileData> = {},
): {
  accounts: SlowTradingStorageData["runtime"]["exchangeAccounts"];
  configFile: SlowTradingConfigFileData;
  memoryFile: SlowTradingMemoryFileData;
} {
  const sharedConfig = slowTradingAccountConfig.shared.fromEffectiveConfig(
    storage.sharedConfig,
    storage.config,
  );
  const account = {
    ...slowTradingAccountConfig.trading.withEffectiveConfig(
      storage.account,
      storage.config,
    ),
    sandbox: {
      enabled: storage.runtime.sandboxEnabled,
      initialBalanceUSDT: storage.runtime.sandboxInitialBalanceUSDT,
    },
  };
  const accounts = storage.runtime.exchangeAccounts.map((candidate) =>
    candidate.slug === account.slug ? account : candidate,
  );
  const {
    exchangeAccounts: _exchangeAccounts,
    sandboxEnabled: _sandboxEnabled,
    sandboxInitialBalanceUSDT: _sandboxInitialBalanceUSDT,
    ...runtime
  } = clone(storage.runtime);

  return {
    accounts,
    configFile: {
      config: sharedConfig,
      runtime,
      updatedAt: storage.updatedAt,
    },
    memoryFile: {
      accounts: {
        ...(memoryRaw.accounts ?? {}),
        [account.slug]: stripClosedPositionsFromMemory(storage.modes),
      },
      updatedAt: storage.updatedAt,
    },
  };
}

/**
 * Persist the current storage object into the new split-file slow-trading format.
 *
 * @param storage - Full slow-trading storage state.
 * @returns Promise that resolves when both files are written.
 */
async function saveSplitSlowTradingStorage(
  storage: SlowTradingStorageData,
): Promise<void> {
  const normalized = {
    ...storage,
    updatedAt: Date.now(),
  };
  const memoryRaw = (await fs.pathExists(FILES.slow.memory))
    ? ((await fs.readJSON(
        FILES.slow.memory,
      )) as Partial<SlowTradingMemoryFileData>)
    : {};
  const { accounts, configFile, memoryFile } = splitSlowTradingStorage(
    normalized,
    memoryRaw,
  );

  await slowTradingJsonFile.write.atomic(FILES.slow.config, configFile);
  await slowTradingJsonFile.write.atomic(FILES.slow.memory, memoryFile);
  await saveSlowTradingExchangeAccounts(accounts, normalized.sharedConfig);
}

/**
 * Reads the split config file with current defaults applied.
 */
async function loadSlowTradingConfigFile(accountSlug?: string): Promise<{
  account: SlowTradingStorageData["account"];
  config: SlowTradingStorageData["config"];
  sharedConfig: SlowTradingStorageData["sharedConfig"];
  runtime: SlowTradingStorageData["runtime"];
  updatedAt: number;
}> {
  const hasConfigFile = await fs.pathExists(FILES.slow.config);
  const configRaw = hasConfigFile
    ? ((await fs.readJSON(
        FILES.slow.config,
      )) as Partial<SlowTradingConfigFileData>)
    : {};
  const baseConfig = createDefaultSlowTradingConfig();
  const baseRuntime = createDefaultSlowTradingRuntime();
  const sharedConfig = {
    ...baseConfig,
    ...(configRaw.config ?? {}),
    modelConfig: normalizeExitModelConfigDefaults(
      configRaw.config?.modelConfig,
      baseConfig.modelConfig,
    ),
    adaptiveAveraging: adaptiveAveraging.config.normalize(
      configRaw.config?.adaptiveAveraging ?? baseConfig.adaptiveAveraging,
    ),
    blackSwan: blackSwan.config.normalize(
      configRaw.config?.blackSwan ?? baseConfig.blackSwan,
    ),
    maxOpenPositions: normalizeMaxOpenPositions(
      configRaw.config?.maxOpenPositions ?? baseConfig.maxOpenPositions,
    ),
    symbols: uniqueSymbols(configRaw.config?.symbols ?? baseConfig.symbols),
  };
  const exchangeAccounts = await loadSlowTradingExchangeAccounts(
    sharedConfig,
  );
  const runtime = ensureExchangeAccountSelection({
    ...baseRuntime,
    ...(configRaw.runtime ?? {}),
    exchangeAccounts,
    exchangeAccountSlug: normalizeExchangeAccountSlug(
      accountSlug ??
        configRaw.runtime?.exchangeAccountSlug ??
        baseRuntime.exchangeAccountSlug,
    ),
    notification: normalizeRuntimeNotification(
      configRaw.runtime?.notification ?? baseRuntime.notification,
      configRaw.runtime?.autoEntryDailyPnlLimitUSDT === undefined,
    ),
    withdrawal: normalizeWithdrawalConfig(configRaw.runtime?.withdrawal),
    safeHaven: normalizeSafeHavenConfig(
      configRaw.runtime?.safeHaven,
      sharedConfig.modelConfig,
    ),
    mcp: normalizeMcpConfig(configRaw.runtime?.mcp),
  });
  const account =
    exchangeAccounts.find(
      (candidate) => candidate.slug === runtime.exchangeAccountSlug,
    ) ?? exchangeAccounts[0];
  if (!account) throw new Error("SLOW requires at least one exchange account");
  runtime.exchangeAccountSlug = account.slug;
  runtime.sandboxEnabled = account.sandbox.enabled;
  runtime.sandboxInitialBalanceUSDT = account.sandbox.initialBalanceUSDT;
  const config = slowTradingAccountConfig.trading.toEffectiveConfig(
    sharedConfig,
    account,
  );

  runtime.sandboxInitialBalanceUSDT = Math.max(
    0,
    Number(runtime.sandboxInitialBalanceUSDT ?? DEFAULT_SANDBOX_INITIAL_BALANCE),
  );
  runtime.autoEntryDailyPnlLimitUSDT =
    slowTradingDailyPnlLimit.config.normalizeThresholdUsdt(
      runtime.autoEntryDailyPnlLimitUSDT,
    );
  runtime.autoRemoveSymbolAbsLevel = normalizeAutoRemoveSymbolAbsLevel(
    runtime.autoRemoveSymbolAbsLevel,
  );
  runtime.autoRemoveSymbolMinPrice = normalizeAutoRemoveSymbolMinPrice(
    runtime.autoRemoveSymbolMinPrice,
  );
  runtime.autoRemoveSymbolMinMarketCapUSD =
    normalizeAutoRemoveSymbolMinMarketCapUSD(
      runtime.autoRemoveSymbolMinMarketCapUSD,
    );
  runtime.autoRemoveSymbolMinVPointPct =
    normalizeAutoRemoveSymbolMinVPointPct(
      runtime.autoRemoveSymbolMinVPointPct,
    );
  runtime.pnlHistoryBucketMinutes =
    slowTradingPnlHistory.bucket.normalizeMinutes(
      runtime.pnlHistoryBucketMinutes,
    );
  normalizeStageRuntimeConfig(runtime);

  return {
    account,
    config,
    sharedConfig,
    runtime,
    updatedAt: configRaw.updatedAt ?? Date.now(),
  };
}

/**
 * Migrate the legacy single-file slow-trading state into the split-file format.
 *
 * @returns Migrated storage state when legacy data exists, otherwise null.
 */
async function migrateLegacySlowTradingState(): Promise<SlowTradingStorageData | null> {
  if (!(await fs.pathExists(FILES.slow.legacyState))) {
    return null;
  }

  const raw = (await fs.readJSON(
    FILES.slow.legacyState,
  )) as Partial<SlowTradingStorageData>;
  const base = createDefaultSlowTradingStorage();
  const config = {
    ...base.config,
    ...(raw.config ?? {}),
    modelConfig: normalizeExitModelConfigDefaults(
      raw.config?.modelConfig,
      base.config.modelConfig,
    ),
    blackSwan: blackSwan.config.normalize(
      raw.config?.blackSwan ?? base.config.blackSwan,
    ),
    maxOpenPositions: normalizeMaxOpenPositions(
      raw.config?.maxOpenPositions ?? base.config.maxOpenPositions,
    ),
    symbols: uniqueSymbols(raw.config?.symbols ?? base.config.symbols),
  };
  const sharedConfig = slowTradingAccountConfig.shared.fromEffectiveConfig(
    base.sharedConfig,
    config,
  );
  const loadedAccounts = await loadSlowTradingExchangeAccounts(config);
  const account = slowTradingAccountConfig.trading.withEffectiveConfig(
    loadedAccounts[0] ?? base.account,
    config,
  );
  const runtime = ensureExchangeAccountSelection({
    ...base.runtime,
    ...(raw.runtime ?? {}),
    exchangeAccounts: [
      account,
      ...loadedAccounts.filter((candidate) => candidate.slug !== account.slug),
    ],
    exchangeAccountSlug: account.slug,
    sandboxEnabled: account.sandbox.enabled,
    sandboxInitialBalanceUSDT: account.sandbox.initialBalanceUSDT,
    notification: normalizeRuntimeNotification(
      raw.runtime?.notification ?? base.runtime.notification,
      raw.runtime?.autoEntryDailyPnlLimitUSDT === undefined,
    ),
    withdrawal: normalizeWithdrawalConfig(raw.runtime?.withdrawal),
    safeHaven: normalizeSafeHavenConfig(raw.runtime?.safeHaven, config.modelConfig),
    mcp: normalizeMcpConfig(raw.runtime?.mcp),
  });

  const storage: SlowTradingStorageData = {
    ...base,
    account,
    sharedConfig,
    config,
    runtime,
    modes: {
      live: ensureTradeSettings(
        {
          ...base.modes.live,
          ...(raw.modes?.live ?? {}),
        },
        raw.config?.symbols ?? base.config.symbols,
      ),
      sandbox: ensureTradeSettings(
        {
          ...base.modes.sandbox,
          ...(raw.modes?.sandbox ?? {}),
        },
        raw.config?.symbols ?? base.config.symbols,
      ),
    },
    updatedAt: raw.updatedAt ?? base.updatedAt,
  };
  storage.runtime.pnlHistoryBucketMinutes =
    slowTradingPnlHistory.bucket.normalizeMinutes(
      storage.runtime.pnlHistoryBucketMinutes,
    );
  storage.runtime.autoEntryDailyPnlLimitUSDT =
    slowTradingDailyPnlLimit.config.normalizeThresholdUsdt(
      storage.runtime.autoEntryDailyPnlLimitUSDT,
    );
  normalizeStageRuntimeConfig(storage.runtime);

  await saveSplitSlowTradingStorage(storage);
  await fs.remove(FILES.slow.legacyState);
  await migrateInlineClosedPositionsToHistoryFiles(storage);

  return storage;
}

/**
 * Load slow-trading storage from disk and normalize missing/default fields.
 *
 * @param options - Optional history hydration controls.
 * @returns Hydrated slow-trading storage object.
 */
export async function loadSlowTradingStorage(
  options: LoadSlowTradingStorageOptions = {},
): Promise<SlowTradingStorageData> {
  await migrateLegacyHistoryRoot();

  // A. Migrate the legacy single-file state when it still exists.
  const migrated = await migrateLegacySlowTradingState();
  if (migrated) {
    return loadSlowTradingStorage(options);
  }

  const hasConfigFile = await fs.pathExists(FILES.slow.config);
  const hasMemoryFile = await fs.pathExists(FILES.slow.memory);

  // B. Create brand-new split files only when both files are still missing.
  if (!hasConfigFile && !hasMemoryFile) {
    const initial = createDefaultSlowTradingStorage();
    await saveSlowTradingStorage(initial);
    if (options.includeHistory) {
      await hydrateSlowTradingHistoryFromFiles(initial);
    }
    return initial;
  }

  // C. Merge persisted split-file data on top of the latest defaults.
  // C.1 Support partial migrations by reading whichever file already exists.
  const memoryRaw = hasMemoryFile
    ? ((await fs.readJSON(
        FILES.slow.memory,
      )) as Partial<SlowTradingMemoryFileData>)
    : {};
  const {
    account,
    config,
    sharedConfig,
    runtime,
    updatedAt: configUpdatedAt,
  } = await loadSlowTradingConfigFile(options.account);
  const sandboxInitialBalanceUSDT = runtime.sandboxInitialBalanceUSDT;

  const activeMode: SlowTradingMode = runtime.sandboxEnabled
    ? "sandbox"
    : "live";
  const effectiveModeScope =
    !hasConfigFile || !hasMemoryFile
      ? "all"
      : options.modeScope ?? "all";

  const storage: SlowTradingStorageData = {
    account,
    sharedConfig,
    config,
    runtime,
    modes: {
      live: loadModeStateForScope({
        accountSlug: account.slug,
        mode: "live",
        activeMode,
        memoryRaw,
        modeScope: effectiveModeScope,
        sandboxInitialBalanceUSDT,
        symbols: config.symbols,
      }),
      sandbox: loadModeStateForScope({
        accountSlug: account.slug,
        mode: "sandbox",
        activeMode,
        memoryRaw,
        modeScope: effectiveModeScope,
        sandboxInitialBalanceUSDT,
        symbols: config.symbols,
      }),
    },
    updatedAt: configUpdatedAt ?? memoryRaw.updatedAt ?? Date.now(),
  };

  // C.2 Seed sandbox balance when this is an old file with no initialized memory yet.
  if (
    effectiveModeScope === "all" &&
    !storage.modes.sandbox.dynamicTradeMemory.startingBalanceUSDT &&
    storage.modes.sandbox.tradeSettings.every(
      (item) =>
        (item.model_memory.positions?.length ?? 0) === 0 &&
        (item.model_memory.positionsSell?.length ?? 0) === 0,
    )
  ) {
    storage.modes.sandbox.dynamicTradeMemory.startingBalanceUSDT =
      sandboxInitialBalanceUSDT;
    storage.modes.sandbox.dynamicTradeMemory.quoteAsset =
      sandboxInitialBalanceUSDT;
  }

  const migratedInlineHistory =
    await migrateInlineClosedPositionsToHistoryFiles(storage);

  // C.3 Heal partial split storage by re-saving the fully normalized pair.
  if (
    effectiveModeScope === "all" &&
    (!hasConfigFile || !hasMemoryFile || migratedInlineHistory)
  ) {
    await saveSlowTradingStorage(storage);
  }

  if (options.includeHistory) {
    await hydrateSlowTradingHistoryFromFiles(storage);
  }

  return storage;
}

/**
 * Persist the full slow-trading storage payload to disk.
 *
 * @param storage - Storage state to save.
 * @returns Promise that resolves when the file has been written.
 */
export async function saveSlowTradingStorage(
  storage: SlowTradingStorageData,
): Promise<void> {
  await saveSplitSlowTradingStorage(storage);
}

/** Removes orphaned live/sandbox memory after a dependency-safe account deletion. */
export async function deleteSlowTradingAccountState(
  accountSlug: string,
): Promise<void> {
  if (!(await fs.pathExists(FILES.slow.memory))) return;
  const memory = (await fs.readJSON(
    FILES.slow.memory,
  )) as Partial<SlowTradingMemoryFileData>;
  if (!memory.accounts?.[accountSlug]) return;
  const accounts = { ...memory.accounts };
  delete accounts[accountSlug];
  await slowTradingJsonFile.write.atomic(FILES.slow.memory, {
    accounts,
    updatedAt: Date.now(),
  } satisfies SlowTradingMemoryFileData);
}

/**
 * Persist one mode's execution memory while preserving the latest config/runtime.
 *
 * Long-running cycles can start from an older runtime snapshot. Re-loading before
 * the final write keeps UI settings changes from being overwritten by that cycle.
 *
 * @param mode - Mode whose memory should be replaced.
 * @param modeState - Updated mode memory to persist.
 * @returns Latest storage after the mode memory has been saved.
 */
export async function saveSlowTradingModeState(
  mode: "live" | "sandbox",
  modeState: SlowTradingStorageData["modes"]["live"],
  options: { account?: string } = {},
): Promise<SlowTradingStorageData> {
  await migrateLegacyHistoryRoot();
  const migrated = await migrateLegacySlowTradingState();
  if (migrated) {
    return saveSlowTradingModeState(mode, modeState, options);
  }

  const { account, config, sharedConfig, runtime, updatedAt } =
    await loadSlowTradingConfigFile(options.account);
  const hasMemoryFile = await fs.pathExists(FILES.slow.memory);
  const memoryRaw = hasMemoryFile
    ? ((await fs.readJSON(
        FILES.slow.memory,
      )) as Partial<SlowTradingMemoryFileData>)
    : {};
  const sandboxInitialBalanceUSDT = Math.max(
    0,
    Number(runtime.sandboxInitialBalanceUSDT ?? DEFAULT_SANDBOX_INITIAL_BALANCE),
  );
  const targetModeState = ensureTradeSettings(modeState, config.symbols);
  await persistClosedPositionsToHistoryFiles(mode, targetModeState);

  const fallbackModes = memoryRaw.accounts?.[account.slug] ??
    memoryRaw.modes ?? {
    live: createModeState(0),
    sandbox: createModeState(sandboxInitialBalanceUSDT),
  };
  // PROD:MULTI_ACCOUNT_STATE_ISOLATION
  const nextMemory: SlowTradingMemoryFileData = {
    accounts: {
      ...(memoryRaw.accounts ?? {}),
      [account.slug]: {
        live:
          mode === "live"
            ? stripClosedPositionsFromModeMemory(targetModeState)
            : fallbackModes.live ?? createModeState(0),
        sandbox:
          mode === "sandbox"
            ? stripClosedPositionsFromModeMemory(targetModeState)
            : fallbackModes.sandbox ??
              createModeState(sandboxInitialBalanceUSDT),
      },
    },
    updatedAt: Date.now(),
  };

  await slowTradingJsonFile.write.atomic(FILES.slow.memory, nextMemory);

  return {
    account,
    config,
    sharedConfig,
    runtime,
    modes: {
      live:
        mode === "live"
          ? targetModeState
          : loadModeStateForScope({
              accountSlug: account.slug,
              mode: "live",
              activeMode: mode,
              memoryRaw: nextMemory,
              modeScope: "active",
              sandboxInitialBalanceUSDT,
              symbols: config.symbols,
            }),
      sandbox:
        mode === "sandbox"
          ? targetModeState
          : loadModeStateForScope({
              accountSlug: account.slug,
              mode: "sandbox",
              activeMode: mode,
              memoryRaw: nextMemory,
              modeScope: "active",
              sandboxInitialBalanceUSDT,
              symbols: config.symbols,
            }),
    },
    updatedAt,
  };
}

/**
 * Apply a partial config/runtime update and persist the resulting storage.
 *
 * @param update - Partial storage update payload.
 * @returns Updated storage state after persistence.
 */
export async function updateSlowTradingStorage(
  update: SlowTradingStorageUpdateInput,
): Promise<SlowTradingStorageData> {
  const requestedAccount = normalizeExchangeAccountSlug(
    update.exchangeAccountSlug,
  );
  const storage = await loadSlowTradingStorage({
    account: requestedAccount || undefined,
  });
  let safeHavenLog: Parameters<typeof appendSlowTradingSafeHavenLog>[0] | null =
    null;

  // A. Apply strategy-config updates.
  if (update.config) {
    storage.config = {
      ...storage.config,
      ...update.config,
      maxOpenPositions: normalizeMaxOpenPositions(
        update.config.maxOpenPositions ?? storage.config.maxOpenPositions,
      ),
      blackSwan: blackSwan.config.normalize(
        update.config.blackSwan ?? storage.config.blackSwan,
      ),
    };
    storage.sharedConfig =
      slowTradingAccountConfig.shared.fromEffectiveConfig(
        storage.sharedConfig,
        storage.config,
      );
    storage.account = slowTradingAccountConfig.trading.withEffectiveConfig(
      storage.account,
      storage.config,
    );
  }

  // B. Apply legacy top-level update fields kept for API compatibility.
  if (update.exchangeType) {
    storage.config.exchangeType = update.exchangeType;
  }

  if (typeof update.sandboxEnabled === "boolean") {
    storage.runtime.sandboxEnabled = update.sandboxEnabled;
  }

  if (typeof update.runnerEnabled === "boolean") {
    storage.runtime.runnerEnabled = update.runnerEnabled;
  }

  if (typeof update.autoEntryEnabled === "boolean") {
    storage.runtime.autoEntryEnabled = update.autoEntryEnabled;
  }

  if (update.autoEntryDailyPnlLimitUSDT !== undefined) {
    storage.runtime.autoEntryDailyPnlLimitUSDT =
      slowTradingDailyPnlLimit.config.normalizeThresholdUsdt(
        update.autoEntryDailyPnlLimitUSDT,
      );
  }

  if (typeof update.autoExitEnabled === "boolean") {
    storage.runtime.autoExitEnabled = update.autoExitEnabled;
  }

  if (typeof update.entrySignalBypass === "boolean") {
    storage.runtime.entrySignalBypass = update.entrySignalBypass;
  }

  if (typeof update.autoRemoveSymbolAbsLevel === "number") {
    storage.runtime.autoRemoveSymbolAbsLevel =
      normalizeAutoRemoveSymbolAbsLevel(update.autoRemoveSymbolAbsLevel);
  }

  if (typeof update.autoRemoveSymbolMinPrice === "number") {
    storage.runtime.autoRemoveSymbolMinPrice =
      normalizeAutoRemoveSymbolMinPrice(update.autoRemoveSymbolMinPrice);
  }

  if (typeof update.autoRemoveSymbolMinMarketCapUSD === "number") {
    storage.runtime.autoRemoveSymbolMinMarketCapUSD =
      normalizeAutoRemoveSymbolMinMarketCapUSD(
        update.autoRemoveSymbolMinMarketCapUSD,
      );
  }

  if (typeof update.autoRemoveSymbolMinVPointPct === "number") {
    storage.runtime.autoRemoveSymbolMinVPointPct =
      normalizeAutoRemoveSymbolMinVPointPct(
        update.autoRemoveSymbolMinVPointPct,
      );
  }

  if (update.pnlHistoryBucketMinutes !== undefined) {
    storage.runtime.pnlHistoryBucketMinutes =
      slowTradingPnlHistory.bucket.normalizeMinutes(
        update.pnlHistoryBucketMinutes,
      );
  }

  if (update.speedupStageIntervalMinutes !== undefined) {
    storage.runtime.speedupStageIntervalMinutes =
      slowTradingStages.interval.normalizeMinutes(
        update.speedupStageIntervalMinutes,
        slowTradingStages.interval.defaults.speedup,
      );
  }

  if (update.blackSwanStageIntervalMinutes !== undefined) {
    storage.runtime.blackSwanStageIntervalMinutes =
      slowTradingStages.interval.normalizeMinutes(
        update.blackSwanStageIntervalMinutes,
        slowTradingStages.interval.defaults["risk-sentinel"],
      );
  }

  if (update.speedupStagePositivePnlThresholdPct !== undefined) {
    storage.runtime.speedupStagePositivePnlThresholdPct =
      slowTradingStages.position.speedupThreshold.normalizePct(
        update.speedupStagePositivePnlThresholdPct,
        slowTradingStages.position.speedupThreshold.defaults.positivePct,
      );
  }

  if (update.speedupStageNegativePnlThresholdPct !== undefined) {
    storage.runtime.speedupStageNegativePnlThresholdPct =
      slowTradingStages.position.speedupThreshold.normalizePct(
        update.speedupStageNegativePnlThresholdPct,
        slowTradingStages.position.speedupThreshold.defaults.negativePct,
      );
  }

  if (update.speedupStageTakeProfitOffsetPct !== undefined) {
    storage.runtime.speedupStageTakeProfitOffsetPct =
      slowTradingStages.position.speedupThreshold.normalizePct(
        update.speedupStageTakeProfitOffsetPct,
        slowTradingStages.position.speedupThreshold.defaults
          .takeProfitOffsetPct,
      );
  }

  if (update.standardMonitoringStageIntervalMinutes !== undefined) {
    storage.runtime.standardMonitoringStageIntervalMinutes =
      slowTradingStages.interval.normalizeMinutes(
        update.standardMonitoringStageIntervalMinutes,
        slowTradingStages.interval.defaults["standard-monitoring"],
      );
  }

  if (update.managementStageIntervalMinutes !== undefined) {
    storage.runtime.managementStageIntervalMinutes =
      slowTradingStages.interval.normalizeMinutes(
        update.managementStageIntervalMinutes,
        slowTradingStages.interval.defaults.management,
      );
  }

  if (update.captureEntryStageIntervalMinutes !== undefined) {
    storage.runtime.captureEntryStageIntervalMinutes =
      slowTradingStages.interval.normalizeMinutes(
        update.captureEntryStageIntervalMinutes,
        slowTradingStages.interval.defaults["capture-entry"],
      );
  }

  if (update.notification !== undefined) {
    storage.runtime.notification = normalizeDashboardNotificationConfig(
      update.notification,
      "SLOW",
    );
  }

  if (requestedAccount) {
    storage.runtime.exchangeAccountSlug = storage.account.slug;
  }
  storage.runtime = ensureExchangeAccountSelection(storage.runtime);

  if (typeof update.sandboxInitialBalanceUSDT === "number") {
    storage.runtime.sandboxInitialBalanceUSDT = Math.max(
      0,
      update.sandboxInitialBalanceUSDT,
    );
  }

  storage.account = {
    ...storage.account,
    sandbox: {
      enabled: storage.runtime.sandboxEnabled,
      initialBalanceUSDT: storage.runtime.sandboxInitialBalanceUSDT,
    },
    updatedAt: Date.now(),
  };
  storage.runtime.exchangeAccounts = storage.runtime.exchangeAccounts.map(
    (account) =>
      account.slug === storage.account.slug ? storage.account : account,
  );

  if (update.withdrawal !== undefined) {
    storage.runtime.withdrawal = normalizeWithdrawalConfig({
      ...storage.runtime.withdrawal,
      ...update.withdrawal,
    });
  }

  if (update.safeHaven !== undefined) {
    storage.runtime.safeHaven = normalizeSafeHavenConfig({
      ...storage.runtime.safeHaven,
      ...update.safeHaven,
    });
  }

  if (update.mcp !== undefined) {
    storage.runtime.mcp = normalizeMcpConfig({
      ...storage.runtime.mcp,
      ...update.mcp,
    });
  }

  if (update.symbols) {
    storage.config.symbols = uniqueSymbols(update.symbols);
  }

  storage.sharedConfig = slowTradingAccountConfig.shared.fromEffectiveConfig(
    storage.sharedConfig,
    storage.config,
  );
  storage.account = slowTradingAccountConfig.trading.withEffectiveConfig(
    storage.account,
    storage.config,
  );

  // C. Rebuild per-mode trade settings after config changes, then persist.
  storage.modes.live = ensureTradeSettings(
    storage.modes.live,
    storage.config.symbols,
  );
  storage.modes.sandbox = ensureTradeSettings(
    storage.modes.sandbox,
    storage.config.symbols,
  );

  if (typeof update.safeHavenUSDT === "number") {
    const activeMode = getActiveSlowTradingMode(storage);
    const { nextUSDT: nextSafeHavenUSDT, previousUSDT: previousSafeHavenUSDT } =
      applySlowTradingSafeHavenUpdate(
        storage.modes[activeMode],
        update.safeHavenUSDT,
      );

    if (Math.abs(previousSafeHavenUSDT - nextSafeHavenUSDT) > 1e-9) {
      safeHavenLog = {
        account: storage.account.slug,
        mode: activeMode,
        previousUSDT: previousSafeHavenUSDT,
        nextUSDT: nextSafeHavenUSDT,
        source: update.safeHavenLogSource ?? "manual_update",
        reason: update.safeHavenLogReason,
      };
    }
  }

  await saveSlowTradingStorage(storage);
  if (safeHavenLog) {
    await appendSlowTradingSafeHavenLog(safeHavenLog);
  }

  return storage;
}

/**
 * Reset the sandbox mode state while keeping the configured initial balance.
 *
 * @returns Storage state after sandbox reset.
 */
export async function resetSandboxSlowTrading(params?: {
  account?: string;
  sandboxInitialBalanceUSDT?: number;
}): Promise<SlowTradingStorageData> {
  const storage = await loadSlowTradingStorage({ account: params?.account });
  if (typeof params?.sandboxInitialBalanceUSDT === "number") {
    storage.runtime.sandboxInitialBalanceUSDT = Math.max(
      0,
      params.sandboxInitialBalanceUSDT,
    );
  }
  storage.modes.sandbox = ensureTradeSettings(
    createModeState(storage.runtime.sandboxInitialBalanceUSDT),
    storage.config.symbols,
  );
  // PROD:MULTI_ACCOUNT_SANDBOX_ISOLATION
  await saveSlowTradingStorage(storage);
  return storage;
}
