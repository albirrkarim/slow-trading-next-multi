import { DASHBOARD_UI_API } from "./constants";

export const slowEndpoints = {
  // used for production
  prod: {
    coinMetadata: `${DASHBOARD_UI_API}/slow-trading/coin-metadata`,
    storage: `${DASHBOARD_UI_API}/slow-trading/storage`,
    blackSwan: `${DASHBOARD_UI_API}/slow-trading/black-swan`,
    blackSwanPreview: `${DASHBOARD_UI_API}/slow-trading/black-swan-preview`,
    history: `${DASHBOARD_UI_API}/slow-trading/history`,
    exchangeAccounts: `${DASHBOARD_UI_API}/slow-trading/exchange-accounts`,
    entry: `${DASHBOARD_UI_API}/slow-trading/entry`,
    entryDiagnostics: `${DASHBOARD_UI_API}/slow-trading/entry-diagnostics`,
    exit: `${DASHBOARD_UI_API}/slow-trading/exit`,
    run: `${DASHBOARD_UI_API}/slow-trading/run`,
    signal: `${DASHBOARD_UI_API}/slow-trading/signal`,
    reset: `${DASHBOARD_UI_API}/slow-trading/reset`,
    withdraw: `${DASHBOARD_UI_API}/slow-trading/withdraw`,
    balanceSnapshots: `${DASHBOARD_UI_API}/slow-trading/balance-snapshots`,
    queue: `${DASHBOARD_UI_API}/slow-trading/queue`,
    logs: `${DASHBOARD_UI_API}/slow-trading/logs`,
    mcpTokens: `${DASHBOARD_UI_API}/slow-trading/mcp-tokens`,
    notificationTest: `${DASHBOARD_UI_API}/slow-trading/notification-test`,
    quickBacktest: `${DASHBOARD_UI_API}/slow-trading/quick-backtest`,
    broadcastCoinMetadata: `${DASHBOARD_UI_API}/slow-trading/debug/broadcast-coin-metadata`,
    syncOnlineCoinMetadataToLocal: `${DASHBOARD_UI_API}/slow-trading/debug/sync-online-coin-metadata-to-local`,
    syncOnlineToLocal: `${DASHBOARD_UI_API}/slow-trading/debug/sync-online-to-local`,
  },
  // used mostly for development and backtest
  dev: {
    fundingRates: `${DASHBOARD_UI_API}/dashboard/funding-rates`,
    initialize: `${DASHBOARD_UI_API}/dashboard/initialize`,
    klines: `${DASHBOARD_UI_API}/dashboard/klines`,
    volatility: `${DASHBOARD_UI_API}/dashboard/volatility`,
    priceNorm: `${DASHBOARD_UI_API}/dashboard/price-norm`,
  },
} as const;
