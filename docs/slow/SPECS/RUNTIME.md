### A.0 Volatility Points Threshold

`VOLATILITY_THRESHOLD` is a deployment-level strategy tuning value. It
controls the percentage price move required to activate volatility detection.
When it is not configured, the system defaults to `5`.

Production and backtest should use the same configured threshold when their
volatility points are expected to be comparable. Changing this threshold
changes how frequently volatility points form; it does not change
`config.minActionableAbsoluteLevel`, which separately controls which completed
vPoint levels decision.v19 and decision.v20 may treat as actionable.

The SLOW navbar displays the server-resolved global value as `Vol: <value>%`.
The browser receives this value through the dashboard state and does not read
the server environment directly.

TC: `PROD:GLOBAL_VOLATILITY_THRESHOLD`

### A.0.1 Daily PnL Browser Title

The `/slow` browser-tab title is `<APP_NAME> | <current UTC-day net PnL USD>`.
It uses the same closed-trade UTC-day calculation as the navbar and Daily PnL
Calendar, formats positive and zero values with `+` and negative values with
`-`, and refreshes whenever the dashboard state refreshes. Missing or blank
`APP_NAME` falls back to `SLOW`.

TC: `PROD:DAILY_PNL_META_TITLE`

### A.1 Production stages

The production runner is split into four independently scheduled stages. The
stage intervals are positive whole minutes, are configurable from Dashboard
Settings > Runtime, and have these defaults:

- Speedup: `runtime.speedupStageIntervalMinutes = 1`.
- Speedup positive net PnL threshold:
  `runtime.speedupStagePositivePnlThresholdPct = 1.5`.
- Speedup negative net PnL threshold magnitude:
  `runtime.speedupStageNegativePnlThresholdPct = 1.5`.
- Speedup take-profit proximity offset:
  `runtime.speedupStageTakeProfitOffsetPct = 0.5`.
- Standard Monitoring: `runtime.standardMonitoringStageIntervalMinutes = 5`.
- Management: `runtime.managementStageIntervalMinutes = 5`.
- Capture Entry: `runtime.captureEntryStageIntervalMinutes = 5`.

Live and sandbox production modes use these stages. Backtesting keeps its
existing candle-driven simulation flow and is not affected.

The three trading stages give each coin at most one trading responsibility at a
time:

- Speedup owns an open position when any Speedup promotion rule below is true.
- Standard Monitoring owns every other open position and excludes all Speedup
  positions.
- Capture Entry owns configured coins without an open position and excludes
  every coin that already has one.

Management is independent from those trading responsibilities. It evaluates
every configured coin, including coins with open positions, without running
entry, averaging, exit, PnL, or funding work.

The Speedup promotion rules are independent and combined with OR:

- Persisted fee-aware PnL is at or above
  `runtime.speedupStagePositivePnlThresholdPct`.
- Persisted fee-aware PnL is at or below the negative value of
  `runtime.speedupStageNegativePnlThresholdPct`.
- StopLoss+ is enabled and persisted `position.pnl.maxUpPct` has reached the
  configured `takeProfitPercent`, meaning StopLoss+ has been armed.
- Persisted fee-aware PnL is at least
  `max(0, takeProfitPercent - runtime.speedupStageTakeProfitOffsetPct)`.
- The existing post-average target-approach rule is true.
- The position has reached its first post-entry direction-specific target
  vPoint: TOP for LONG and BOTTOM for SHORT.

The post-average target-approach rule is true only when all these conditions
are met:

- The position has at least one persisted averaging execution.
- The position has a valid persisted `pnl.markPrice` and its symbol has a valid
  latest persisted vPoint price.
- Favorable drift from that latest vPoint is strictly greater than
  `VOLATILITY_THRESHOLD / 2`. For LONG, favorable drift rises toward TOP and is
  `(markPrice - vPoint.p) / vPoint.p * 100`. For SHORT, favorable drift falls
  toward BOTTOM and is `(vPoint.p - markPrice) / vPoint.p * 100`.

The StopLoss+ and target-vPoint rules are sticky because `maxUpPct` and the
vPoint history are persisted. Current-PnL and target-approach rules are
re-evaluated from their latest persisted values. No duplicate position marker
is stored for facts already represented by those canonical fields.

Stage selection uses these persisted values and does not fetch a fresh price.
Therefore, Standard Monitoring first refreshes `pnl.markPrice`; a qualifying
position moves to Speedup on the next Speedup pass. The existing post-average
approach criterion remains an independent Speedup path, and a position returns
to Standard only when no Speedup rule remains true.

Standard Monitoring refreshes PnL and vPoint history on its normal pass. When
that persisted state first satisfies any Speedup rule, the position becomes
eligible on the next Speedup pass. The runner does not fetch prices for all
Standard positions every minute merely to discover crossings. A Speedup
position returns to Standard only when none of the rules remain true.

For futures in both live and sandbox, a successful monitoring pass also stores
the latest valid funding snapshot on each eligible open position as
`position.funding`. The snapshot contains the raw decimal `rate`, exchange
snapshot time `t`, optional next settlement time `nextT`, and source
`exchange`. Older exchange snapshots never replace a newer persisted value.

Funding refresh uses one all-symbol public exchange request shared by every
position and dashboard consumer. The in-process result is cached for five
minutes, concurrent requests are coalesced, and a failed request starts a
five-minute retry backoff. A failure never interrupts entry, averaging, exit,
PnL, or monitoring persistence; the position retains its last successful
funding snapshot. Closed history retains the final snapshot for audit.

TC: `PROD:MONITORING_POSITION_FUNDING_RATE`

Stage timers are independent, but balance-changing execution and mode-state
persistence are serialized. Before a queued stage executes, it reloads current
storage and classifies symbols again. This prevents entry, averaging, exit, and
manual API cycles from overwriting the same persisted balance or position
state. A stage with no eligible symbols returns without exchange execution or
cache persistence, but it does persist its compact successful-run statistics.

TC: `PROD:SPEEDUP_STAGE`

TC: `PROD:STANDARD_MONITORING_STAGE`

TC: `PROD:MANAGEMENT_STAGE`

TC: `PROD:CAPTURE_ENTRY_STAGE`

Each mode retains the latest successful pass for every stage in the optional,
backward-compatible `modeState.stageRuns` map. Each record contains its
completion time (`t`), duration (`ms`), eligible-symbol count, execution-report
count, summary, and section-duration breakdown. A successful pass with zero
eligible symbols is recorded so scheduler health does not appear stale. A
disabled or failed pass does not replace the last successful record. Empty
passes use one mode-memory write; that write is intentionally excluded from the
empty pass's timing breakdown so recording its own duration does not require a
second persistence write.

The legacy `lastRunAt`, `lastRunDurationMs`, `lastRunSummary`, and
`lastRunPerformance` fields remain populated with the latest completed cycle
for compatibility. The navbar Last Run tooltip shows all four stage records in
a table using `<reports> reports / <eligible coins> coins` for each result.
Expanding a stage renders only that stage's captured performance sections. The
tooltip uses a high-contrast foreground and divider treatment in both light and
dark dashboard themes.

TC: `PROD:STAGE_RUN_STATS`

The trading and Management stages may use shared volatility memory. The existing vPoint
sync throttle remains authoritative; a one-minute Speedup interval does not
force new five-minute klines or bypass volatility throttling.

- Kline syncing is throttled according to the latest volatility point's
  distance from `config.minActionableAbsoluteLevel`: points three or more
  absolute levels below the actionable level sync after 6 hours, points two
  levels below it sync after 4 hours, and points one level below or at/above it
  keep the normal 5-minute vPoint sync cadence. This preserves the previous level `0`/`1`/`2`
  behavior when the actionable level is `3`. A volatility memory without a
  previous sync time syncs immediately. An empty volatility memory that already
  completed a no-point sync retries after 6 hours instead of refetching six
  months of klines every cycle.

TC: `BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE`

Capture Entry feeds its eligible coins' latest shared volatility data into the
decision engine and may execute entry logic when automatic entry is enabled.
It does not run open-position monitoring.

Automatic entry also has a UTC-day USDT PnL stop, configured by
`runtime.autoEntryDailyPnlLimitUSDT` and defaulting to `-50`. The comparison
uses the same `USD` value shown in the navbar: the net `pnl.netUsdt` sum of all
trades closed during the current UTC day. Winning and losing trades offset each
other; this is not an accumulated-loss counter. At or below the threshold,
fresh automatic entries pause. Automatic exits continue, and forced manual
entries remain available. Entry diagnostics
show `DAILY_PNL_LIMIT_REACHED`. If later exits raise the current day's net PnL
above the threshold, automatic entry can resume; the value resets naturally at
the next UTC day.

TC: `PROD:AUTO_ENTRY_DAILY_PNL_LIMIT_USDT`

The production standalone server must bootstrap the SLOW runner when the Node
process starts. Restarting or redeploying a Railway container must not require
opening the website URL first to wake the cycle. Dashboard/API access may still
call the runner singleton as a fallback, but it is not the primary startup path.

TC: `PROD:RUNNER_BOOTSTRAP_ON_SERVER_START`

The production cycle can be run with an opt-in section-duration observer. This
does not change normal runner behavior, but tests and diagnostics can collect
timings for signal build, volatility assignment, exchange calls, execution,
reporting, and persistence to identify the slowest cycle step.

TC: `PROD:CYCLE_PERFORMANCE_SECTION_DURATION`

### A.2 Monitoring

TC: `PROD:MONITORING_OPEN_POSITION`

Speedup and Standard Monitoring refresh their eligible open positions, evaluate
exit, evaluate averaging for positions that remain open, and then persist the
latest PnL reporting state. Exit has priority: when exit and averaging could
both qualify on the same pass, SLOW evaluates exit first and must not average a
position that was just closed.

Behavior expected:

- Speedup monitoring defaults to every 1 minute.
- Standard monitoring defaults to every 5 minutes.
- Both intervals are configurable in the Runtime settings tab.

- What interval it saving the pnl history pct?

* Each successful monitoring pass adds or updates the position's PnL history.

* `runtime.pnlHistoryBucketMinutes` controls the retained PnL history bucket
  in whole minutes. It defaults to `60` and has a minimum value of `1`.

* For active positions, monitoring replaces the most recent point within the
  same configured time bucket. Entering the next bucket appends a new
  point. The latest bucket therefore stays current with each 5-minute
  monitoring snapshot.

* Configuring a history bucket below the position's active stage interval does
  not increase monitoring frequency. Speedup and Standard positions therefore
  have different minimum effective sample cadences.

Every fee-aware `position.pnl.netUsdt` observation also updates the position's
USDT extrema:

- `position.pnl.maxUpUsdt` is the highest observed `netUsdt`.
- `position.pnl.maxDownUsdt` is the lowest observed `netUsdt`.
- The first finite observation initializes both fields. Production monitoring,
  exchange-side close reconciliation, dynamic backtests, and quick-backtest
  history must preserve the same semantics.
- Trade History exposes both values as sortable **Max Up USD** and
  **Max Down USD** columns.

TC: `BOTH:POSITION_PNL_USDT_EXTREMA`

Every successfully monitored production position persists
`position.lastMonitoringStage` with the actual completed stage (`speedup` or
`standard`), its `lastUpdated` timestamp, and the classification `reason`
captured before that pass executes. Failed monitoring does not replace this
diagnostic. New entries do not claim a monitoring stage before their first
successful monitoring pass. The field remains on a position after close so
trade history preserves its latest monitoring diagnostic.

The Trade History symbol cell omits coin tags and shows the closed position's
last monitoring stage. When that stage is `standard`, the cell also shows the
persisted classification reason. Legacy rows without the optional diagnostic
show an em dash for the stage.

The Trade History JSON detail uses a read-only interactive tree. The root is
expanded with nested objects collapsed initially. Every nested object or array
can be expanded or collapsed independently with its disclosure control or the
keyboard, and the toolbar can expand the entire tree, collapse nested values,
or copy the complete formatted JSON.

TC: `PROD:TRADE_HISTORY_JSON_TREE`

The Standard reason records the canonical persisted `pnl.netPct` used during
stage selection and the active positive and negative PnL thresholds. Dashboard
display values and older PnL-history samples are not used to classify the next
stage.

The open-position UI does not re-run stage classification. It shows an
icon-only Speedup chip only when the persisted stage is `speedup`, and the
tooltip renders the persisted reason and timestamp. Speed-tier metadata tag
chips are not duplicated in the open-position header. Dashboard polling
remains at 10 minutes; users may manually reload the non-critical dashboard to
see newer persisted diagnostics.

- During live monitoring, the system should sync open-position size and margin from the exchange.

Local book values may differ from exchange values because of rounding, partial fills, fees, contract sizing, or manual exchange actions.

When exchange data is available, the exchange position is the **source of truth** for live position size, avg entry price, leverage, and margin. The local `model_memory.positions` record should be adjusted when it differs.

If the exchange no longer has the position but local memory still does, the system should treat it as externally closed and move the local position out of open positions with an `[CLOSED_ON_EXCHANGE]` reason.

TC: `PROD:SYNC_ENTRY_POSITION_FROM_EXCHANGE`

Live futures exit bookkeeping is transactional with exchange confirmation.
Before evaluating an exit, SLOW snapshots the symbol's local model memory. The
initial futures close order is `reduceOnly`, preventing an oversized or stale
local quantity from opening a reverse position. After an accepted order, SLOW
waits five seconds and queries the exchange position for the same symbol and
direction. If a residual position remains, SLOW submits one additional market
close using the exchange-reported residual quantity with `reduceOnly`, waits
five seconds again, and verifies the position is gone.

Only an exchange-confirmed close remains in local closed history. When order
submission, confirmation, or the residual close fails, SLOW restores the local
memory snapshot, leaves the position open, marks it for a forced exit on the
next monitoring cycle, and emits the normal exit-failed notification. Sandbox
and backtest exits do not query an exchange and retain their synchronous local
simulation behavior.

TC: `PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE`

### A.3 Balance (balance.test.ts)

We have implement many categorize the balance into:

**balance.available**

Available is sum of spendable + reserved + safeHaven (its actual live free usdt on the exchange)

only virtualy within the system is divided into spendable, reserved, safeHaven

TC: `BOTH:BALANCE_AVAILABLE`

**balance.spendable**

[VIRTUAL] this amount is can be used for new entry or bailing out for `BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT`

spendable = balance.available - balance.reserved - balance.safeHaven

`balance.available` is the exchange free quote balance, so active-position
margin is already excluded. `balance.locked` must not be subtracted again.

TC: `BOTH:BALANCE_SPENDABLE`

**balance.reserved**

[VIRTUAL] Reserved balance for doing averaging of the open positions.

TC: `BOTH:BALANCE_RESERVED`

**balance.locked**

Total margin of the active open position.

TC: `BOTH:BALANCE_LOCKED`

**balance.safeHaven**

[VIRTUAL] Amount balance that virtualy protected by this system. based on the config it will take monthly from the spendable balance.

Editing the safeHaven value will affect the balance.spendable

the purpose:

- Protect capital
- Taking out capital from the trading system and reserve for the auto withdrawal system.

TC: `BOTH:BALANCE_SAFE_HAVEN`

Info:

- [VIRTUAL] Virtually calculated within system.

UI:

Total asset is shown on the navbar on the left of the balance break down.

total asset = balance.available + balance.locked

its like total usdt + current margin of open position

so yes its not floating asset. based on the pnl of active position

TC: `PROD:TOTAL_ASSET`

**MCP balance contract**

The read-only `slow_balance_read` tool exposes the same canonical balance
model for the active, live, or sandbox mode. The top-level `balance` is summed
across every enabled exchange account and `accounts[]` retains the contribution
from each included account. Disabled accounts are excluded. The response also
includes the balance equations and a plain-language meaning for every field so
agents do not guess how spendable, reserved, Safe Haven, locked, or total asset
values relate.

Live mode attempts to refresh the exchange-free USDT balance and may fall back
to persisted state when the exchange read fails. Sandbox mode uses simulated
state. The MCP `totalAsset` remains `available + locked`; it is not floating
equity and does not include unrealized P&L.

TC: `PROD:MCP_BALANCE`

TC: `PROD:MULTI_ACCOUNT_COMBINED_MCP_BALANCE`

### A.4 Use same Volatility Point array data

All views of volatility points on this dashboard productin must using the same source of truth volatility points.

the strategy is doing on the backend.

all the volatility points data that being out from the api it must opening from the storage.

TC: `PROD:SAME_VOLATILITY_POINT`

### A.5 Latest 24-hour quote volume

Each Latest Volatility Point card shows the coin's current 24-hour quote
volume. The dashboard fetches one ticker batch from the configured exchange
and explicit SPOT/FUTURES market, then persists a compact snapshot under the
SLOW storage root. A failed refresh falls back to the last snapshot for that
same exchange and market.

The card also shows a client-side maximum-entry estimate derived from 24-hour
quote volume. The estimate uses 0.01% of 24-hour quote volume and is labeled as
a liquidity-risk estimate, not guaranteed order-book depth.

TC: `PROD:LATEST_VOLATILITY_VOLUME_24H`

### A.5.1 Coin metadata sharing

Coin tag CRUD, coin tag assignment, and coin descriptions are shared across
configured SLOW deployments. After a local metadata mutation, the server sends
the full metadata snapshot to every URL in `COIN_METADATA_SYNC_PEERS` using
`SYNC_TOKEN`. Incoming sync replaces the local coin metadata
snapshot atomically and does not rebroadcast, preventing sync loops. This keeps
local, wealth, holy, fast, or any other configured instance aligned without
loading extra runtime memory when the UI is closed.

TC: `PROD:COIN_METADATA_SYNC`

### A.5.2 Runtime memory and history hydration

SLOW production history is persisted in split per-symbol history files. Normal
runtime storage loads must not hydrate those closed positions back into every
symbol's `model_memory.positionsSell`, because the runner and idle server only
need active positions, balances, config, and compact execution memory. Dashboard,
history deletion, and trade-history chart overlays can explicitly request
history hydration.

Decision engines that need monthly closed-trade counts receive only the current
UTC month's history during temporary signal generation. This keeps the
classifier input intact without loading full durable history into idle/runtime
memory.

Runner, withdrawal, and manual execution paths load only the currently active
mode's per-symbol trade memory. The inactive mode stays on disk and is preserved
when the active mode is saved, so switching live/sandbox later still keeps its
previous memory without doubling runner-cycle RAM.

TC: `PROD:SLOW_RUNTIME_MEMORY_LEAN`

### A.6 Worker capacity and historical entry sequences

The dashboard shows how many equal-sized additional entry workers fit in the
current spendable balance. It uses the shared SLOW entry-margin adjustment,
watch reserve multiplier, fixed/percentage entry caps, minimum entry amount,
and preserves the largest unreserved bailout step across active positions and
the projected new worker.

TC: `PROD:AVAILABLE_ENTRY_WORKERS`

Dashboard Settings opens on Trading and orders its primary tabs as Trading,
Management, then Runtime. Management owns the Main profile/account fields and
Safe Haven settings. Management does not expose the development leaderboard
config picker. The Safe Haven heading tooltip explains that it is a virtual
protected balance and summarizes each configured monthly schedule. Due work is
queued on the first active runner pass at or after its configured UTC date.
Trading uses equal 6/6 columns at medium and large
breakpoints, then stacks into 12-column rows at small breakpoints. The left
column contains the editable Entry, Averaging, and Exit strategy inputs. The
right column is a live preview calculated from the current spendable balance
and open positions plus the unsaved Trading settings.
The Averaging heading begins with its master checkbox. When disabled, reserve
levels, reserve multiplier, maximum averaging levels, and Adaptive Averaging are
visually disabled while their configured values are retained. Section headings
use bold emphasis; child checkbox labels use normal weight.

The Backup tab exposes the complete editable configuration as copyable JSON,
including exchange credentials, notifications, withdrawals, and all strategy
settings. A pasted full backup is structurally validated and loaded into the
unsaved settings draft; it is persisted only when the normal Save action is
used. The UI warns that the backup contains sensitive credentials and wallet
details.

The account-selected Trading editor shows a multiline Strategy Notes field
between `Editing Account` and Entry. It persists as the selected account's
`trading.notes`, switches with the account profile, and never affects entry,
exit, reserve, leverage, or worker-capacity calculations.

The Entry preview shows estimated entry margin, averaging reserve, total
budget per worker, preserved bailout buffer when applicable, and available
worker count. In the multi-account Trading editor, its balance, open positions,
position limit, and bailout candidates belong only to the account selected by
`Editing Account`; combined dashboard totals must not enter this calculation.
It includes a local spendable-assumption input that defaults to that selected
account's current live spendable balance, resets to the newly selected
account's balance when the editor changes accounts, and recalculates the
read-only preview without saving configuration. When fixed max entry margin is
disabled, the preview auto-fits the estimated entry margin so one worker plus
its preserved bailout buffer can fit in the assumed spendable balance. The Exit
preview shows approximate take-profit and stop-loss USDT per worker for
entry-only stage 1 and every cumulative averaging stage through
`watchMaxNextAveragingLevels`.
Each stage adds its configured rolling averaging margin, applies leverage to the
cumulative margin, then calculates take-profit and stop-loss USDT from that
stage's estimated notional. This includes unreserved stages allowed by the
maximum averaging cap; adaptive averaging can increase the actual runtime
margin beyond the configured multiplier preview. A disabled stop loss is shown
as disabled instead of as zero loss. The preview exposes the arithmetic for the
entry plus each rolling reserve step, worker capacity, cumulative margin,
leveraged notional, take profit, and stop loss. It keeps calculation
descriptions in tooltips on their formulas instead of repeating description
lines in the preview. Each stage arranges its calculations in a two-column
grid when space allows and stacks them on narrow screens.

Each stage also shows the applicable post-average stop-loss tier. A distinct
`FIRST STOP OUTCOME` compares the unconditional hard-percent, fixed net-USDT,
and active post-average boundaries and identifies the smallest estimated loss.
This matches the volatility-point backtest's rail back-thinking when one rail
crosses multiple stops at once.

The preview also lists the largest `UNRESERVED` watch step from each applicable
open position, shows the
projected new worker's largest `UNRESERVED` step, and uses the maximum across
those candidates as the bailout buffer. This projected worker candidate is
included even when there are no open positions. Its preview shows the rolling
calculation: the entry margin plus all earlier averaging margins, multiplied by
`watchReservePctAlloc`.
The bailout formula has a book action that opens a detailed explanation of the
shared buffer, largest-candidate rule, entry guard, and current live example.
The bailout preview is hierarchical: open-position and projected-worker
candidates are nested beneath the Bailout buffer parent, followed by the
preserved maximum result. Open-position candidates are separated from the
projected worker and their amounts expose an `UNRESERVED` tooltip.
Detailed setting explanations use the same book-icon dialog action instead of a
text-only Readmore button.
Coin-specific 24h-volume limits, final fees, price, quantity, and exchange
precision remain execution-time calculations.
The Live Preview is a standalone dashboard component shared by Trading settings
and manual-entry confirmation. Trading settings renders it from the unsaved
draft and enables the local spendable assumption. Manual-entry confirmation
renders the same component from saved configuration and current spendable
balance without exposing an editable assumption.

TC: `PROD:TRADING_ENTRY_LIVE_PREVIEW`

TC: `PROD:TRADING_ACCOUNT_SCOPED_LIVE_PREVIEW`

TC: `PROD:MULTI_ACCOUNT_TRADING_NOTES`

The dashboard also counts historical entry sequences per coin for the current
vPoint time range. Dashboard candidate signals require
`abs(level) >= config.minActionableAbsoluteLevel`, resolved with the same
minimum/default rules as decision.v19 and decision.v20. Multiple candidate signals inside the
same directional non-zero sequence count once; level zero or a defensive sign
change ends the sequence. LONG and SHORT counts are shown together in the
latest-vPoint table and a per-coin pie chart. Both views display the resolved
threshold used by their calculation.

TC: `PROD:HISTORICAL_ENTRY_SEQUENCES`

The dashboard shows a collapsed `VPoints Frequency` section below Entry
Sequence. It counts all vPoints in the current selected time range by level,
listing every integer level from the observed maximum through the observed
minimum, including levels whose count is zero. Each row shows the floored
percentage that progresses outward from that source level: positive levels
show `% up`, negative levels show `% down`, and level zero shows both branches.
The percentage tooltip shows the complete `target / source × 100` calculation
with its result formatted to two decimal places and names the target level.

TC: `PROD:VPOINTS_FREQUENCY`

Each level row also shows `Max DD` statistics calculated from the `pct` values
of its next outward level in the current selected range. Level `1` uses Level
`2` points, Level `2` uses Level `3`, and negative levels mirror the rule so
Level `-1` uses Level `-2`. Level `0` combines the Level `1` and Level `-1`
samples. Max, average, and minimum use only finite matching `pct` values. A row
without a next outward-level sample displays an unavailable value. Its
keyboard-, hover-, and touch-accessible tooltip identifies the target level,
range, sample count, and that `pct` is the price-movement magnitude from the
preceding pivot to the outward vPoint. Each row also renders a proportional
heatmap whose width is its count divided by the largest level count.

TC: `PROD:VPOINTS_LEVEL_MAX_DD`

The dashboard shows an `Entry Decisions` section immediately below VPoints
Frequency. It evaluates the latest point for every configured coin whose
absolute level meets `config.minActionableAbsoluteLevel`. Each row identifies
the coin, level, and whether it is ready or blocked, followed by the same
server-generated reason used by the entry decision flow. The browser does not
reimplement or translate decision reasons.

For decision.v19, diagnostics distinguish an already-used vPoint, missing BTC
market context, classifier rejection, waiting for a projected faster exit,
another immediate candidate winning the fastest-exit selection, and the
selected ready candidate. For decision.v20, diagnostics distinguish an
already-used vPoint, BTC context exclusion, and every qualifying ready
candidate without requiring Speed timing or BTC price normalization. Shared
pre-execution checks take precedence for a
disabled runner or auto-entry setting, an existing open position, Spot SHORT
restriction, live symbol auto-removal at its configured absolute level,
late-entry profitable price drift above the production 1% limit, an unavailable
current entry candle, a probability-sized entry margin below the trading
minimum, insufficient averaging reserve, or an insufficient bailout buffer.
The late-entry row uses the same current 1-minute candle, calculation, and
reason text as production execution. Entry funding diagnostics use the same
fee/leverage-aware funding plan, 24-hour-volume cap, entry caps, reserve ladder,
and largest-unreserved bailout calculation as production execution. Loading
diagnostics is read-only for trade state and never opens, averages, exits, or
auto-removes a position. A ready row states that final exchange account setup,
quantity-precision validation, and order acceptance still run during execution
and therefore are not guaranteed by this read-only preview.

TC: `PROD:ENTRY_DECISION_DIAGNOSTICS`

The dashboard estimates how many entry workers were needed to capture every
selected-engine opportunity immediately in the current vPoint time range. It
converts each counted entry sequence into an active worker interval from the
first selected-engine signal until level zero, defensive sign change, or the
range end. Overlapping intervals produce min/avg/max worker-needed stats and
a worker-needed-over-time line chart below the Volatility Points chart.

TC: `PROD:WORKER_NEEDED_ESTIMATION`

### A.7 Quick Backtest

The `/slow` dashboard shows a demand-only "Quick Backtest" report below the
Volatility Points chart. The simulation input is the currently visible/cropped
volatility points plus the active SLOW trade config and user-entered starting
USDT amount. It does not mutate live/sandbox SLOW memory and it does not run
when the UI is closed.

The report shows entry count, Sharpe ratio, final gain percent/USDT, average
profit USDT per week, max position drawdown percent, min/avg/max hold
duration, min/avg/max unused-capital duration, a trade-count-by-coin pie chart,
and a growth-over-time chart.
Unused-capital duration measures stretches where no simulated position is open
and formats durations as exact day/hour/minute text such as `12d 4h 30m`. The
capital-duration pie chart uses
timeline-active duration versus timeline-unused duration, so the two slices add
up to the measured backtest window instead of summing every position hold time.
Position drawdown is calculated from the
simulated position's adverse price movement, not portfolio-level equity
drawdown. Quick Backtest Sharpe is calculated from the visible simulation's
event-return equity curve so short dashboard ranges do not collapse to the
monthly leaderboard fallback of `0`. The Volatility Points chart also receives
grouped `TRADE SIMULATION` markers for simulated entry, averaging, and exit
events.

Unlike long research backtests, Quick Backtest does not block entries in the
final three months of data, because the visible dashboard range can be shorter
than that. It still blocks new entries during the final four days before the
selected range end so late entries have time to resolve.

TC: `PROD:QUICK_BACKTEST_VISIBLE_VPOINTS`

## A.8 Coin management and automatic removal

Coin Management owns the configured Symbols list and four automatic-removal
criteria:

- `autoRemoveSymbolAbsLevel`: remove by the latest absolute vPoint level.
- `autoRemoveSymbolMinPrice`: remove when the latest valid 5-minute market
  close is strictly below the configured USDT price.
- `autoRemoveSymbolMinMarketCapUSD`: remove when the latest available USD
  market cap is strictly below the configured threshold.
- `autoRemoveSymbolMinVPointPct`: remove when any vPoint in the coin's complete
  persisted volatility history has `pct >=` the configured threshold.

The absolute-level, minimum-price, and minimum-market-cap settings default to
`0`, which disables them. The stored-vPoint percent setting defaults to `15`.
It can also be disabled explicitly with `0`.

The settings UI uses a decimal number input for the minimum price. The Auto
Remove heading tooltip explains the Management interval, open-position behavior,
and the `0` disable behavior.

The minimum-market-cap input keeps the exact USD number editable and displays a
live compact preview beneath it. Values at or above one million use `M`, values
at or above one billion use `B`, and `0` displays `Disabled`.

TC: `PROD:AUTO_REMOVE_MARKET_CAP_INPUT_PREVIEW`

When the setting is greater than `0`, the independent Management cycle checks
the latest persisted vPoint for each configured coin. Capture Entry or the
position-monitoring stage that owns the coin remains responsible for refreshing
that shared volatility memory; Management does not duplicate its market sync.
If the latest vPoint has
`abs(lvl) >= autoRemoveSymbolAbsLevel`, SLOW removes that coin from the
configured symbol list and filters it out of new entry signals for that cycle.

When `autoRemoveSymbolMinPrice > 0`, both live and sandbox block every new entry,
including a forced entry, when the latest valid market price is strictly below
the configured minimum. A price equal to the minimum remains eligible. Missing
or invalid price data does not prove that the coin is below the minimum, so it
does not remove the coin; the existing market-data and execution checks remain
responsible for deciding whether entry can continue.

The independent Management cycle also removes a below-minimum coin from the
configured Symbols list. Capture Entry retains a fresh minimum-price guard and
a latest-config symbol-membership guard immediately before order execution, so
a longer Management interval does not permit entries below the price threshold
or into a coin already removed from the latest config.

When `autoRemoveSymbolMinMarketCapUSD > 0`, the Management cycle resolves
market caps for configured symbols through the persistent CoinMarketCap cache.
Successful values remain fresh for 24 hours per symbol. A coin is removed only
when its known market cap is strictly below the threshold. An equal, missing,
invalid, or failed market-cap response does not remove the coin. This rule does
not add an entry guard.

When `autoRemoveSymbolMinVPointPct > 0`, the Management cycle reads every
configured symbol's complete volatility memory from
`slow/<exchange>/volatility/<symbol>.json`. It checks every stored point, not
only the latest or the pruned runtime sequence. TOP and BOTTOM `pct` fields are
both positive movement magnitudes. A coin is removed when any valid stored
point has `pct >= autoRemoveSymbolMinVPointPct`; equality is included. Missing,
invalid, or unreadable volatility storage does not remove the coin. The
management log and notification identify the highest matching stored point.
This historical rule does not add an entry guard.

The Latest Volatility Points table displays the cached market-cap fetch time
directly below each market-cap value using the dashboard's local timezone.

For supported perpetual-futures exchanges, the table displays a sortable
`Funding rate` column immediately after `Market cap`. Binance USD-M data comes
from the public premium-index endpoint in one all-symbol request. Each row shows
the signed percentage, which position side pays, and Binance's snapshot update
time in the dashboard's local timezone. Unavailable or non-futures values show
`—`. The dashboard refreshes this snapshot on initialization and with its
10-minute state poll; a failed poll retains the last successfully displayed
snapshot.

Every sortable Latest Volatility Points column header shows a help icon and a
hover, keyboard-focus, or touch tooltip. Each tooltip states what the column
means and identifies its data source. Funding-rate help additionally explains
that the rate is a periodic transfer between perpetual-futures holders: a
positive rate often indicates a crowded LONG side, so LONG pays SHORT; a
negative rate often indicates a crowded SHORT side, so SHORT pays LONG. It does
not measure the number of traders, and the displayed value is for one funding
interval rather than an annual rate.

Management runs on `runtime.managementStageIntervalMinutes`, a positive whole
number of minutes configurable under Dashboard Settings > Runtime with a
default of `5`. Its price, market-cap, and volatility evaluation runs outside
the serialized trading-stage queue. Only the short commit reloads current
storage, re-evaluates candidates using the latest thresholds and symbol list,
and serializes persistence with trading mutations. Logs and notifications run
after the commit. This keeps slow management data sources from delaying entry
capture while preventing stale config writes from overwriting position state.

All removal criteria may remove a symbol even when it has an open position in
live or sandbox. Removal changes only the configured universe for new entries.
The symbol's retained trade setting and position memory continue through
Speedup or Standard Monitoring, so the active trade can still be monitored,
averaged, and exited normally. This also applies when every configured symbol
already has an open position: Management evaluates configured symbols regardless
of Capture Entry eligibility. The minimum-price entry guard only controls new
entries.

TC: `PROD:AUTO_REMOVE_COIN_ABOVE_SOME_ABS_LEVEL`

TC: `PROD:AUTO_REMOVE_COIN_BELOW_MIN_PRICE`

TC: `PROD:AUTO_REMOVE_COIN_BELOW_MIN_MARKET_CAP`

TC: `PROD:AUTO_REMOVE_COIN_BY_VPOINT_PCT`

TC: `PROD:AUTO_REMOVE_COIN_WITH_OPEN_POSITION`

TC: `PROD:MARKET_CAP_CACHE_ONE_DAY`

TC: `PROD:MARKET_CAP_UPDATED_AT`

TC: `PROD:LATEST_VOLATILITY_FUNDING_RATE`

TC: `PROD:LATEST_VOLATILITY_COLUMN_HELP`

TC: `BOTH:BLOCK_ENTRY_BELOW_AUTO_REMOVE_MIN_PRICE`

## A.9 Safe Haven & Withdrawal Queue

Scheduled Safe Haven and withdrawal work must be represented as persistent
queue items instead of being executed directly by the scheduler.

This prevents a due withdrawal from producing the same failure log on every
runner cycle when Safe Haven does not yet contain enough balance. The queue item
remains the source of truth for its latest status until it succeeds or is
manually deleted.

### Queue scheduling

- Safe Haven has a global automatic switch and any number of named monthly
  schedules. Each enabled schedule selects a UTC calendar day from 1 through
  31 and creates at most one queue item per mode and UTC month.
- A schedule may request either a fixed USDT amount or a percentage of current
  portfolio assets. The percentage uses the human-readable 0–100 scale; `10`
  means 10%. A positive fixed amount takes priority.
- Dates unavailable in a short month use that month's final UTC day.
- If the runner misses a Safe Haven date, it creates the overdue item on the
  next active runner pass in that UTC month.
- Several Safe Haven schedules may create several pending queue items in the
  same month. Live and sandbox maintain independent markers for every schedule.
- Each enabled automatic withdrawal schedule selects one UTC calendar day from
  1 through 31 and creates at most one queue item per UTC month.
- When a configured day does not exist in a shorter month, the schedule uses
  that month's final UTC day. For example, day 31 runs on February 28 or 29 and
  April 30.
- If the runner misses the configured withdrawal date, it creates the overdue
  queue item on the next active production runner pass in that UTC month.
- An existing pending item prevents the scheduler from creating a duplicate.
- Deleting a scheduled item does not clear that schedule's monthly marker, so
  it is not recreated until its next monthly occurrence.

### Queue processing

- The SLOW runner attempts the active mode's due Safe Haven item before live
  withdrawal items.
- A pending item records:
  - when it was created;
  - what action it will perform;
  - the latest attempt time;
  - the next attempt time;
  - the latest attempt message.
- Waiting conditions, such as insufficient balance, update the queue item
  without repeatedly writing the same failure log.
- Operational withdrawal failures may be logged once when the failure message
  changes.
- A completed queue item is deleted automatically.

### Safe Haven behavior

- Safe Haven is virtual balance accounting and must work in both live and
  sandbox modes.
- Each Safe Haven queue item belongs to one mode and may update only that
  mode's balance and scheduling state.
- Safe Haven queue items may complete partially.
- Each attempt moves only the safely spendable amount and must continue to
  respect `minimalAssetOnTrade`.
- The queue stores the remaining amount after each partial movement.
- The item is deleted only after the full requested amount has moved into Safe
  Haven.

TC: `BOTH:SAFE_HAVEN_QUEUE`

TC: `PROD:SAFE_HAVEN_SCHEDULE_QUEUE`

### Withdrawal behavior

- Withdrawal queue items are all-or-nothing.
- The item remains pending until Safe Haven contains the full configured
  withdrawal amount and all existing live withdrawal safety checks pass.
- Automatic queue execution uses the schedule's full configured amount. It does
  not use the `2 USDT` manual-withdrawal cap.
- A stable client withdrawal id is reused when the same queue item is retried.

TC: `PROD:WITHDRAW_QUEUE`

### Manual queue management

The Safe Haven and Withdrawal sections provide a `Create Queue` button using a
`ButtonDialog`:

- Safe Haven manual creation accepts a requested USDT amount and creates the
  item for the currently active mode.
- Withdrawal manual creation selects an existing withdrawal schedule.
- Creating a withdrawal queue must warn that it may result in a real withdrawal
  for the schedule's full amount.
- Each queue row provides only a delete/cancel action. Queue execution remains
  controlled by the normal production runner.

### Dashboard

The `/slow` dashboard displays two responsive columns:

- `Safe Haven`
  - scheduling tooltip;
  - Safe Haven queue;
  - Safe Haven logs.
- `Withdrawal`
  - scheduling tooltip;
  - withdrawal queue;
  - withdrawal logs.

Safe Haven Logs and Withdrawal Logs remain in their respective columns. Error
Logs remain available below the two columns, followed immediately by Coin
Management Logs. Coin Management Logs are loaded only after expansion and
record every Symbols addition or removal with its source and reason.

The withdrawal settings display recurring schedules as a list with:

- schedule name and enabled state;
- configured USDT amount;
- UTC day of month;
- calculated next occurrence;
- owning wallet-book entry, network, and masked address;
- Update, Delete, and Test actions aligned on the right.

Adding and updating schedules uses `ButtonDialog`. Delete requires confirmation.
Test also uses a warning dialog because it submits a real Binance withdrawal
with the existing server-side `2 USDT` cap; it is not a dry run.

Wallet Book settings use a compact list with:

- wallet name;
- Binance network code;
- masked wallet address with the full value available in a tooltip;
- schedules currently using the wallet;
- Update and Delete actions aligned on the right.

Adding and updating wallets uses `ButtonDialog`. Deleting a referenced wallet
requires confirmation and converts linked schedules to custom targets using the
wallet's latest network and address.

### Persistence

Queue data is stored as compact JSON at:

`storage/persistent/instances/3010/slow/queue.json`

This corresponds to `${PERSISTENT_STORAGE_ROOT}/slow/queue.json` for other
instances.
