import type { TradeSettings } from "@/components/api/dynamic";
import type { DynamicTradeConfig, DynamicTradeMemory } from "@/lib/dynamic";
import type {
  ExchangeAccount,
  ExchangeAccountSlug,
} from "@/lib/exchange/account-context";
import type {
  DashboardNotificationConfig,
  NotificationChannel,
} from "@/lib/notification/config";
import type {
  Position,
  PositionExecutionMode,
  TradingModelConfig,
} from "@/lib/trading/models";
import type { BlackSwanState } from "@/lib/trading/black-swan";
import type { SlowTradingCyclePerformanceSummary } from "./performance";

/** Available SLOW execution modes. */
export type SlowTradingMode = PositionExecutionMode;

/** Independently scheduled production stage. */
export type SlowTradingStage =
  | "risk-sentinel"
  | "speedup"
  | "standard-monitoring"
  | "management"
  | "capture-entry";

/** Compact persisted result of one successful production-stage pass. */
export interface SlowTradingStageRunStats {
  /** Completion timestamp in milliseconds. */
  t: number;
  /** Total stage duration in milliseconds. */
  ms: number;
  /** Number of symbols eligible for this pass. */
  symbols: number;
  /** Number of execution reports produced by this pass. */
  reports: number;
  /** Human-readable result summary. */
  summary: string;
  /** Section-duration breakdown captured for this pass. */
  performance: SlowTradingCyclePerformanceSummary;
}

/** Latest successful pass retained independently for each production stage. */
export type SlowTradingStageRunStatsMap = Partial<
  Record<SlowTradingStage, SlowTradingStageRunStats>
>;

/** High-volatility side used for notification dedupe. */
export type SlowTradingHighVolatilityZone = "POSITIVE" | "NEGATIVE";
export type SlowTradingHighVolatilityNotificationState = Partial<
  Record<
    NotificationChannel,
    Record<string, SlowTradingHighVolatilityZone>
  >
>;

/** Per-channel transition state for the daily PnL automatic-entry stop. */
export type SlowTradingDailyPnlLimitNotificationState = Partial<
  Record<
    NotificationChannel,
    {
      /** Whether this channel has delivered the current breach. */
      b: boolean;
      /** UTC day key. */
      d: string;
    }
  >
>;

/** Current explanation for an actionable coin's entry outcome. */
export interface SlowTradingEntryDiagnostic {
  code: string;
  level: number;
  pointId: string;
  reason: string;
  status: "blocked" | "ready";
  symbol: string;
}

/** Persistent SLOW log collection exposed by the dashboard API. */
export type SlowTradingLogKind =
  | "errors"
  | "management"
  | "safe_haven"
  | "withdrawals";

/** Saved withdrawal destination wallet. */
export interface SlowTradingWithdrawalWallet {
  /** Stable wallet-book id referenced by withdrawal schedules. */
  id: string;
  /** Human-readable wallet label shown in the settings UI. */
  name: string;
  /** Exchange withdrawal network code, for example BSC or TRX. */
  network: string;
  /** Destination wallet address for the selected network. */
  address: string;
}

/** Recurring or manually runnable withdrawal schedule. */
export interface SlowTradingWithdrawalSchedule {
  /** Stable schedule id used by manual and recurring withdrawal actions. */
  id: string;
  /** Immutable account slug whose funds this schedule withdraws. */
  account: ExchangeAccountSlug;
  /** Human-readable schedule name shown in the withdrawal UI. */
  name: string;
  /** Whether this schedule is allowed to run. */
  enabled: boolean;
  /** Requested amount; automatic runs use it while manual runs apply their cap. */
  amountUSDT: number;
  /** Preferred UTC calendar day; short months use their final day. */
  dayOfMonth: number;
  /** Optional wallet-book id used as the schedule target. */
  walletId?: string;
  /** Fallback network when no wallet-book entry is selected. */
  targetNetwork: string;
  /** Fallback wallet address when no wallet-book entry is selected. */
  targetWalletAddress: string;
  /** Last time this schedule attempted a withdrawal. */
  lastAttemptAt?: number;
  /** Last time this schedule completed successfully. */
  lastSuccessAt?: number;
  /** Last time the recurring scheduler created a queue item. */
  lastQueuedAt?: number;
  /** Latest human-readable execution status for UI review. */
  lastStatus?: string;
}

/** Withdrawal runtime settings stored under SLOW runtime config. */
export interface SlowTradingWithdrawalConfig {
  /** Enables recurring automatic withdrawal scans. */
  autoEnabled: boolean;
  /** Saved recurring/manual withdrawal schedules. */
  schedules: SlowTradingWithdrawalSchedule[];
  /** Saved destination wallets reusable by schedules. */
  walletBook: SlowTradingWithdrawalWallet[];
}

/** Recurring request that moves trading capital into the virtual Safe Haven. */
export interface SlowTradingSafeHavenSchedule {
  /** Stable schedule id used for queue deduplication. */
  id: string;
  /** Human-readable schedule name shown in settings and queue diagnostics. */
  name: string;
  /** Whether this schedule is allowed to create queue items. */
  enabled: boolean;
  /** Fixed USDT request. When positive, this takes priority over pct. */
  amountUSDT: number;
  /** Percent of current assets to protect, using 10 for 10%. */
  pct: number;
  /** Preferred UTC calendar day; short months use their final day. */
  dayOfMonth: number;
  /** Last queue creation timestamp retained independently for each mode. */
  lastQueuedAt?: Partial<Record<SlowTradingMode, number>>;
}

/** Safe Haven recurring schedule settings stored under SLOW runtime config. */
export interface SlowTradingSafeHavenConfig {
  /** Enables automatic Safe Haven schedule scans. */
  autoEnabled: boolean;
  /** Saved monthly Safe Haven schedules. */
  schedules: SlowTradingSafeHavenSchedule[];
}

export const SLOW_TRADING_MCP_PERMISSIONS = [
  "tags.read",
  "tags.write",
  "coin_metadata.read",
  "coin_metadata.write",
  "coin_metadata.broadcast",
  "balance.read",
  "trade_history.read",
] as const;

/** One permission flag available to an MCP token. */
export type SlowTradingMcpPermission =
  (typeof SLOW_TRADING_MCP_PERMISSIONS)[number];

/** Persisted MCP token record. Raw token secrets are stored only as hashes plus encrypted reveal data. */
export interface SlowTradingMcpTokenRecord {
  /** Stable token id used by the settings API. */
  id: string;
  /** Human-readable token label shown in settings. */
  name: string;
  /** Whether this token can authenticate MCP requests. */
  enabled: boolean;
  /** Enabled MCP tool permissions for this token. */
  permissions: SlowTradingMcpPermission[];
  /** SHA-256 hash of the generated token secret. */
  tokenHash: string;
  /** AES-GCM encrypted generated token secret, used for settings reveal/copy. */
  tokenSecretEncrypted: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** Last successful MCP authentication timestamp in milliseconds. */
  lastUsedAt?: number;
}

/** MCP token fields safe for dashboard/API responses. */
export type SlowTradingMcpPublicTokenRecord = Omit<
  SlowTradingMcpTokenRecord,
  "tokenHash" | "tokenSecretEncrypted"
> & {
  /** Whether settings can reveal/copy this token secret again. */
  secretAvailable: boolean;
};

/** Runtime MCP connector config stored with SLOW settings. */
export interface SlowTradingMcpConfig {
  /** Generated connector tokens. Empty means MCP is disabled. */
  tokens: SlowTradingMcpTokenRecord[];
}

/** Runtime MCP config safe for dashboard/API responses. */
export interface SlowTradingMcpDashboardConfig {
  /** Generated connector tokens without token hashes. */
  tokens: SlowTradingMcpPublicTokenRecord[];
}

/** Persistent operational error log entry. */
export type SlowTradingErrorStatus = "new" | "dismissed" | "solved";

/** Persistent operational error log entry. */
export interface SlowTradingErrorLogEntry {
  /** Stable error log id. */
  id: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** Runtime source that produced the error. */
  source: string;
  /** Current operator triage state. */
  status: SlowTradingErrorStatus;
  /** Normalized error message. */
  message: string;
  /** Optional stack trace captured from Error objects. */
  stack?: string;
  /** Optional JSON-safe diagnostic details. */
  details?: Record<string, unknown>;
}

/** Result of one atomic error-log status transition. */
export interface SlowTradingErrorStatusUpdateResult {
  missingIds: string[];
  updated: SlowTradingErrorLogEntry[];
}

/** Persistent configured-symbol management audit entry. */
export interface SlowTradingManagementLogEntry {
  /** Stable management log id. */
  id: string;
  /** Action timestamp in milliseconds. */
  createdAt: number;
  /** Whether the symbol was added to or removed from config. */
  action: "add" | "remove";
  /** Normalized base-asset symbol. */
  symbol: string;
  /** Runtime or operator path that changed the config. */
  source: string;
  /** Exact rule or operator reason for the change. */
  reason: string;
}

/** Persistent Safe Haven balance-change log entry. */
export interface SlowTradingSafeHavenLogEntry {
  /** Stable Safe Haven log id. */
  id: string;
  /** Immutable account slug whose Safe Haven balance changed. */
  account: ExchangeAccountSlug;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** SLOW mode whose Safe Haven balance changed. */
  mode: SlowTradingMode;
  /** Safe Haven balance before the change. */
  previousUSDT: number;
  /** Safe Haven balance after the change. */
  nextUSDT: number;
  /** Signed balance delta in USDT. */
  deltaUSDT: number;
  /** Runtime source that changed Safe Haven. */
  source: string;
  /** Optional user/system reason for the change. */
  reason?: string;
}

/** Persistent withdrawal audit log entry. */
export interface SlowTradingWithdrawalLogEntry {
  /** Stable withdrawal log id. */
  id: string;
  /** Immutable account slug used for this withdrawal attempt. */
  account: ExchangeAccountSlug;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** Whether the withdrawal was user-triggered or automatic. */
  trigger: "manual" | "automatic";
  /** Execution status captured for audit/review. */
  status: "attempted" | "skipped" | "failed" | "executed";
  /** SLOW mode active when the withdrawal flow ran. */
  mode: SlowTradingMode;
  /** Schedule id involved in the withdrawal flow. */
  scheduleId: string;
  /** Human-readable schedule name at execution time. */
  scheduleName?: string;
  /** Withdrawal amount in USDT after trigger-specific safety limits. */
  amountUSDT?: number;
  /** Safe Haven available before withdrawal execution. */
  availableSafeHavenUSDT?: number;
  /** Target network used for the withdrawal. */
  targetNetwork?: string;
  /** Target wallet address used for the withdrawal. */
  targetWalletAddress?: string;
  /** Human-readable execution message. */
  message: string;
  /** Exchange withdrawal id returned after successful submission. */
  withdrawId?: string;
}

/** Grouped SLOW logs returned to the dashboard. */
export interface SlowTradingLogs {
  /** Recent operational errors. */
  errors: SlowTradingErrorLogEntry[];
  /** Recent configured-symbol additions and removals. */
  management: SlowTradingManagementLogEntry[];
  /** Recent Safe Haven balance changes. */
  safeHaven: SlowTradingSafeHavenLogEntry[];
  /** Recent withdrawal attempts and results. */
  withdrawals: SlowTradingWithdrawalLogEntry[];
}

/** Shared debugging state stored for every pending SLOW queue item. */
export interface SlowTradingQueueItemBase {
  /** Stable queue id used by dashboard cancellation. */
  id: string;
  /** Queue creation timestamp in milliseconds. */
  createdAt: number;
  /** Latest time the runner tried this queue item. */
  lastAttemptAt?: number;
  /** Earliest time the runner will try this queue item again. */
  nextAttemptAt: number;
  /** Latest human-readable attempt result. */
  lastMessage: string;
}

/** Pending monthly movement from trading capital into Safe Haven. */
export interface SlowTradingSafeHavenQueueItem
  extends SlowTradingQueueItemBase {
  /** Queue discriminator. */
  kind: "safe_haven";
  /** Immutable account slug whose mode state owns this queue item. */
  account: ExchangeAccountSlug;
  /** SLOW mode whose virtual balance this queue item updates. */
  mode: SlowTradingMode;
  /** UTC month handled by this queue item, formatted as YYYY-MM. */
  period: string;
  /** Schedule that created this item; absent for manual/legacy items. */
  scheduleId?: string;
  /** Schedule name captured for dashboard debugging. */
  scheduleName?: string;
  /** Original Safe Haven amount requested for the month. */
  requestedUSDT: number;
  /** Amount still waiting to move into Safe Haven. */
  remainingUSDT: number;
}

/** Pending scheduled external USDT withdrawal. */
export interface SlowTradingWithdrawalQueueItem
  extends SlowTradingQueueItemBase {
  /** Queue discriminator. */
  kind: "withdrawal";
  /** Immutable account slug used for execution and retries. */
  account: ExchangeAccountSlug;
  /** Recurring withdrawal schedule that created this item. */
  scheduleId: string;
  /** Schedule name captured for dashboard debugging. */
  scheduleName: string;
  /** Full automatic withdrawal amount. */
  amountUSDT: number;
  /** Target withdrawal network. */
  targetNetwork: string;
  /** Target external wallet address. */
  targetWalletAddress: string;
  /** Stable exchange request id reused by retries. */
  clientWithdrawId: string;
}

/** Any pending SLOW queue item returned by manual queue creation. */
export type SlowTradingQueueItem =
  | SlowTradingSafeHavenQueueItem
  | SlowTradingWithdrawalQueueItem;

/** Dashboard request for manually creating one production queue item. */
export type SlowTradingManualQueueCreateInput =
  | {
      /** Creates a partial-capable Safe Haven queue item. */
      kind: "safe_haven";
      /** Total Safe Haven amount requested by the user. */
      amountUSDT: number;
    }
  | {
      /** Creates an all-or-nothing withdrawal queue item. */
      kind: "withdrawal";
      /** Existing withdrawal schedule used by the queue item. */
      scheduleId: string;
    };

/** Persistent Safe Haven and withdrawal queue collections. */
export interface SlowTradingQueues {
  /** Pending monthly Safe Haven requests. */
  safeHaven: SlowTradingSafeHavenQueueItem[];
  /** Pending recurring withdrawal requests. */
  withdrawals: SlowTradingWithdrawalQueueItem[];
}

/** Model settings edited in the Trading tab and isolated per account. */
export type SlowTradingAccountModelConfig = Omit<
  DynamicTradeConfig["modelConfig"],
  "minimalAssetOnTrade" | "safePercentPerMonth" | "safeUSDTPerMonth"
>;

/** Strategy settings edited in the Trading tab and isolated per account. */
export interface SlowTradingAccountTradingConfig
  extends Pick<
    DynamicTradeConfig,
    | "adaptiveAveraging"
    | "averagingRescueProjectionGuardEnabled"
    | "enableWatchLogic"
    | "exactLeverage"
    | "exitSidewaysToFreeWorkersForStrongCandidates"
    | "maxEntryBased24HourVolPct"
    | "maxEntryMargin"
    | "maxEntryMarginPct"
    | "maxLeverage"
    | "maxOpenPositions"
    | "minActionableAbsoluteLevel"
    | "watchMaxNextAveragingLevels"
    | "watchReserveLevels"
    | "watchReservePctAlloc"
  > {
  modelConfig: SlowTradingAccountModelConfig;
}

/** Sandbox controls edited in the Runtime tab and isolated per account. */
export interface SlowTradingAccountSandboxConfig {
  enabled: boolean;
  initialBalanceUSDT: number;
}

/** Model settings shared by every account and persisted only in config.json. */
export type SlowTradingSharedModelConfig = Pick<
  TradingModelConfig,
  "minimalAssetOnTrade" | "safePercentPerMonth" | "safeUSDTPerMonth"
>;

/** Shared strategy fields persisted once in config.json. */
export type SlowTradingPersistedSharedConfig = Pick<
  DynamicTradeConfig,
  | "blackSwan"
  | "decisionEngineVersion"
  | "description"
  | "exchangeType"
  | "name"
  | "symbols"
  | "tradingMode"
> & {
  modelConfig: SlowTradingSharedModelConfig;
};

/** Complete persisted SLOW account profile excluding its mode memory. */
export interface SlowTradingAccount extends ExchangeAccount {
  /** Disabling an account blocks new entries while preserving position monitoring. */
  enabled: boolean;
  /** Per-account Trading-tab strategy settings. */
  trading: SlowTradingAccountTradingConfig;
  /** Per-account Sandbox-tab settings. */
  sandbox: SlowTradingAccountSandboxConfig;
}

/** Runtime controls shared by live and sandbox modes. */
export interface SlowTradingRuntimeConfig {
  /** Account selected for settings editing and account-scoped API actions. */
  exchangeAccountSlug: ExchangeAccountSlug;
  /** Saved account profiles available to SLOW runtime and backtests. */
  exchangeAccounts: SlowTradingAccount[];
  /** Enables the background SLOW runner loop. */
  runnerEnabled: boolean;
  /** Enables automatic entry execution. */
  autoEntryEnabled: boolean;
  /** Stops automatic entries when current UTC-day navbar PnL reaches this USDT value. */
  autoEntryDailyPnlLimitUSDT: number;
  /** Enables automatic exit execution. */
  autoExitEnabled: boolean;
  /** Allows bypass entry-signal mode for manual/diagnostic runs. */
  entrySignalBypass: boolean;
  /** Auto-removes configured symbols when vpoints reach this absolute level; 0 disables. */
  autoRemoveSymbolAbsLevel: number;
  /** Auto-removes configured symbols and blocks entries below this market price; 0 disables. */
  autoRemoveSymbolMinPrice: number;
  /** Auto-removes configured symbols below this USD market cap; 0 disables. */
  autoRemoveSymbolMinMarketCapUSD: number;
  /** Auto-removes configured symbols when any stored vPoint reaches this percent; 0 disables. */
  autoRemoveSymbolMinVPointPct: number;
  /** Whole-minute bucket used to retain open-position PnL history samples. */
  pnlHistoryBucketMinutes: number;
  /** Whole-minute cadence for qualifying open-position monitoring. */
  blackSwanStageIntervalMinutes: number;
  /** Whole-minute cadence for qualifying open-position monitoring. */
  speedupStageIntervalMinutes: number;
  /** Positive fee-aware PnL percent that promotes a position into Speedup. */
  speedupStagePositivePnlThresholdPct: number;
  /** Negative fee-aware PnL magnitude that promotes a position into Speedup. */
  speedupStageNegativePnlThresholdPct: number;
  /** Distance below configured take profit that promotes a position into Speedup. */
  speedupStageTakeProfitOffsetPct: number;
  /** Whole-minute cadence for other open-position monitoring. */
  standardMonitoringStageIntervalMinutes: number;
  /** Whole-minute cadence for configured-coin management rules. */
  managementStageIntervalMinutes: number;
  /** Whole-minute cadence for entry capture on symbols without positions. */
  captureEntryStageIntervalMinutes: number;
  /** Dashboard notification routing configuration. */
  notification: DashboardNotificationConfig;
  /** Enables sandbox mode availability in the UI/runtime. */
  sandboxEnabled: boolean;
  /** Initial sandbox quote balance used after reset or first boot. */
  sandboxInitialBalanceUSDT: number;
  /** Withdrawal wallet book and recurring schedule config. */
  withdrawal: SlowTradingWithdrawalConfig;
  /** Safe Haven recurring schedule config. */
  safeHaven: SlowTradingSafeHavenConfig;
  /** MCP connector authentication and per-token permissions. */
  mcp: SlowTradingMcpConfig;
}

/** Per-mode trading memory and runtime summary. */
export interface SlowTradingModeState {
  /** Per-symbol trade settings and model memory for this mode. */
  tradeSettings: TradeSettings[];
  /** Shared dynamic trading memory for this mode. */
  dynamicTradeMemory: DynamicTradeMemory;
  /** Last notified high-volatility zone per symbol. */
  highVolatilityNotificationState?: SlowTradingHighVolatilityNotificationState;
  /** Last completed UTC day reported per notification channel. */
  dailyPerformanceNotificationState?: Partial<
    Record<NotificationChannel, string>
  >;
  /** Last daily-PnL-limit transition observed per notification channel. */
  dailyPnlLimitNotificationState?: SlowTradingDailyPnlLimitNotificationState;
  /** Compact current UTC-day closed-trade PnL cache used by the entry guard. */
  dailyPnlLimitState?: {
    /** UTC day key. */
    d: string;
    /** Navbar-equivalent net closed-trade PnL in USDT. */
    usdt: number;
  };
  /** Persisted portfolio-wide crash protection state for this mode. */
  blackSwan?: BlackSwanState;
  /** Last completed cycle timestamp in milliseconds. */
  lastRunAt?: number;
  /** Last completed cycle duration in milliseconds. */
  lastRunDurationMs?: number;
  /** Last completed cycle summary shown in the UI. */
  lastRunSummary?: string;
  /** Last completed cycle section-duration summary. */
  lastRunPerformance?: SlowTradingCyclePerformanceSummary;
  /** Latest successful run statistics retained separately for each stage. */
  stageRuns?: SlowTradingStageRunStatsMap;
}

/** Full SLOW storage shape after config/memory files are merged. */
export interface SlowTradingStorageData {
  /** Account whose effective config and mode state are projected below. */
  account: SlowTradingAccount;
  /** Shared Management and Black-Swan configuration before account overlay. */
  sharedConfig: DynamicTradeConfig;
  /** Strategy configuration shared by live and sandbox modes. */
  config: DynamicTradeConfig;
  /** Runtime controls shared by live and sandbox modes. */
  runtime: SlowTradingRuntimeConfig;
  /** Mode-specific execution memory. */
  modes: Record<SlowTradingMode, SlowTradingModeState>;
  /** Last storage update timestamp in milliseconds. */
  updatedAt: number;
}

/** Dashboard-safe runtime controls shared by live and sandbox modes. */
export type SlowTradingDashboardRuntimeConfig = Omit<
  SlowTradingRuntimeConfig,
  "mcp"
> & {
  /** Dashboard-safe MCP token summary. */
  mcp: SlowTradingMcpDashboardConfig;
};

/** Closed or open position enriched for SLOW dashboard/history output. */
export interface SlowTradingHistoryPosition extends Position {
  /** Mode that owns this history row. */
  mode: SlowTradingMode;
}

/** Account identity, execution mode, and balances shown in combined UI chrome. */
export interface SlowTradingDashboardAccountSummary {
  slug: ExchangeAccountSlug;
  name: string;
  enabled: boolean;
  activeMode: SlowTradingMode;
  balances: {
    availableQuoteAsset: number;
    reservedQuoteAsset: number;
    spendableQuoteAsset: number;
    safeHaven: number;
    lockedQuoteAsset: number;
    startingBalanceUSDT: number;
  };
}

/** Dashboard response shape for the active SLOW mode. */
export interface SlowTradingDashboardState {
  /** Null for the default combined dashboard, otherwise the filtered account. */
  accountFilter: ExchangeAccountSlug | null;
  /** Per-account balances retained even when the default view is combined. */
  accountSummaries: SlowTradingDashboardAccountSummary[];
  /** Currently selected SLOW mode. */
  activeMode: SlowTradingMode;
  /** Global process-level strategy values resolved by the server. */
  globalConfig: {
    /** Percentage move required to activate volatility detection. */
    volatilityThresholdPct: number;
  };
  /** Strategy configuration rendered by the dashboard. */
  config: DynamicTradeConfig;
  /** Runtime controls rendered by the dashboard. */
  runtime: SlowTradingDashboardRuntimeConfig;
  /** Current persisted portfolio-wide protection status and evidence. */
  blackSwan: BlackSwanState;
  /** Balance summary for the active mode. */
  balances: {
    /** Quote asset available before reserve subtraction. */
    availableQuoteAsset: number;
    /** Quote asset reserved for watch/averaging steps. */
    reservedQuoteAsset: number;
    /** Quote asset available after reserve subtraction. */
    spendableQuoteAsset: number;
    /** Safe Haven balance separated from trading capital. */
    safeHaven: number;
    /** Total margin locked by active open positions. */
    lockedQuoteAsset: number;
    /** Initial balance used as the mode baseline. */
    startingBalanceUSDT: number;
  };
  /** Closed/history positions for the active mode. */
  history: SlowTradingHistoryPosition[];
  /** Open positions for the active mode. */
  openPositions: SlowTradingHistoryPosition[];
  /** Dashboard summary statistics. */
  stats: {
    /** Number of closed trade rows. */
    closedTrades: number;
    /** Number of currently open positions. */
    openPositions: number;
    /** Last completed cycle timestamp in milliseconds. */
    lastRunAt?: number;
    /** Last completed cycle duration in milliseconds. */
    lastRunDurationMs?: number;
    /** Last completed cycle summary shown in the UI. */
    lastRunSummary?: string;
    /** Last completed cycle section-duration summary. */
    lastRunPerformance?: SlowTradingCyclePerformanceSummary;
    /** Latest successful run statistics retained separately for each stage. */
    stageRuns: SlowTradingStageRunStatsMap;
    /** Last time the monthly Safe Haven scheduler handled a UTC month. */
    safeHavenLastScheduledAt?: number;
  };
}

/** Partial update payload accepted by SLOW storage APIs. */
export interface SlowTradingStorageUpdateInput {
  /** Partial strategy configuration update. */
  config?: Partial<DynamicTradeConfig>;
  /** Runtime update for background runner enablement. */
  runnerEnabled?: boolean;
  /** Runtime update for automatic entries. */
  autoEntryEnabled?: boolean;
  /** Runtime update for the UTC-day PnL automatic-entry stop. */
  autoEntryDailyPnlLimitUSDT?: number;
  /** Runtime update for automatic exits. */
  autoExitEnabled?: boolean;
  /** Runtime update for bypass entry-signal mode. */
  entrySignalBypass?: boolean;
  /** Runtime update for auto-removing configured symbols by absolute vpoint level. */
  autoRemoveSymbolAbsLevel?: number;
  /** Runtime update for auto-removing configured symbols below a minimum market price. */
  autoRemoveSymbolMinPrice?: number;
  /** Runtime update for auto-removing configured symbols below a minimum USD market cap. */
  autoRemoveSymbolMinMarketCapUSD?: number;
  /** Runtime update for auto-removing configured symbols by any stored vPoint percent. */
  autoRemoveSymbolMinVPointPct?: number;
  /** Runtime update for the open-position PnL history bucket in minutes. */
  pnlHistoryBucketMinutes?: number;
  /** Runtime update for the Risk Sentinel stage interval in minutes. */
  blackSwanStageIntervalMinutes?: number;
  /** Runtime update for the Speedup stage interval in minutes. */
  speedupStageIntervalMinutes?: number;
  /** Runtime update for the Speedup positive PnL threshold. */
  speedupStagePositivePnlThresholdPct?: number;
  /** Runtime update for the Speedup negative PnL threshold magnitude. */
  speedupStageNegativePnlThresholdPct?: number;
  /** Runtime update for the Speedup take-profit proximity offset. */
  speedupStageTakeProfitOffsetPct?: number;
  /** Runtime update for the Standard Monitoring stage interval in minutes. */
  standardMonitoringStageIntervalMinutes?: number;
  /** Runtime update for the Management stage interval in minutes. */
  managementStageIntervalMinutes?: number;
  /** Runtime update for the Capture Entry stage interval in minutes. */
  captureEntryStageIntervalMinutes?: number;
  /** Runtime update for dashboard notification config. */
  notification?: DashboardNotificationConfig;
  /** Runtime update for the account selected in settings and dashboard actions. */
  exchangeAccountSlug?: ExchangeAccountSlug;
  /** Legacy shortcut update for exchange type. */
  exchangeType?: DynamicTradeConfig["exchangeType"];
  /** Runtime update for sandbox availability. */
  sandboxEnabled?: boolean;
  /** Runtime update for sandbox initial balance. */
  sandboxInitialBalanceUSDT?: number;
  /** Optional audit reason for Safe Haven balance updates. */
  safeHavenLogReason?: string;
  /** Optional audit source for Safe Haven balance updates. */
  safeHavenLogSource?: string;
  /** Direct Safe Haven balance update in USDT. */
  safeHavenUSDT?: number;
  /** Strategy symbol list update. */
  symbols?: string[];
  /** Partial withdrawal runtime config update. */
  withdrawal?: Partial<SlowTradingWithdrawalConfig>;
  /** Partial Safe Haven runtime config update. */
  safeHaven?: Partial<SlowTradingSafeHavenConfig>;
  /** Partial MCP runtime config update. */
  mcp?: Partial<SlowTradingMcpConfig>;
}
