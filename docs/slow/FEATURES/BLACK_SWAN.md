# Black Swan Protection

Status: implemented (downward-crash V1).

Implementation summary:

- `src/lib/trading/black-swan.ts` owns the shared pure detector, state machine,
  configuration normalization, and emergency-policy selection.
- `risk-sentinel` is an independent production stage with a default one-minute
  cadence configured by `blackSwanStageIntervalMinutes`.
- Live and sandbox persist separate protection state. The dashboard exposes a
  dedicated `Black Swan` settings tab and a persistent Risk Sentinel decision
  section in the Entry Signals column, immediately above Entry Signals. It
  shows every state, including `NORMAL`, with the reason, evidence, state
  timing, evaluation cadence, and live recovery acknowledgement.
- The final SLOW cycle boundary blocks automatic and forced/manual entries and
  averaging in `WATCH`, `CRISIS`, and `RECOVERY`; exits continue.
- `CLOSE_ADVERSE` and `FLATTEN_ALL` reuse the existing forced-exit path. Futures
  exits therefore retain its reduce-only order behavior and failed-close retry
  state.
- `/dev/black-swan` is the dedicated raw-candle replay page. The existing
  vPoint-only Dynamic Trade backtest is intentionally unchanged.
- Its charts default to an incident-focused window with 30 minutes of context
  before the first protection transition and after recovery. A `Full range`
  toggle preserves the complete selected-period view, and the page uses the
  available dashboard width for clearer inspection.
- The dedicated page validates detector timing and evidence. The Black Swan
  settings tab also provides a date-selectable savings replay with cached raw
  klines, mixed entry/averaging levels, per-symbol candlestick charts, and a
  comparison of normal stop-loss behavior with the current unsaved protection
  policy.

## Problem

SLOW currently protects each position independently. An open position is
monitored and can eventually be closed by its configured stop loss, but the
system does not recognize that many coins are collapsing together because of a
market-wide event.

The observed regression case is the market move around 11 October 2025
(Jakarta date): BTC fell sharply and many altcoins moved much farther. The
vPoint distribution UI shows an approximately `14.61%` BTC range and much
larger ranges for some altcoins, including values above `50%`.

Those vPoint percentages are pivot-to-pivot ranges. They must not be assumed to
be one candle's close-to-close decline. Before this case becomes a permanent
test fixture, the exact BTC and altcoin movement must be measured from the raw
closed one-minute candles stored for the incident.

In this condition, independent position stop losses are insufficient:

- Several LONG positions can hit their stop losses in the same market event.
- Capture Entry may open new positions while the market is still collapsing.
- Watch averaging may add margin into a systemic fall and substantially enlarge
  the loss.
- A five-minute vPoint can be confirmed too late to act as the first warning.
- Treating each coin separately misses the correlation between BTC and the
  configured portfolio.

A black-swan guard cannot guarantee the configured exit price. During a gap,
exchange outage, or exhausted order book, a market or stop order can fill with
slippage or fail. The goal is to stop increasing risk quickly and optionally
reduce exposure before every position reaches its normal stop loss.

## Design Decision

Introduce one global, per-mode `Risk Sentinel` that evaluates market-wide crash
conditions independently of Capture Entry, Standard Monitoring, Management,
and individual vPoint formation.

The sentinel should run every minute by default using closed one-minute
candles. It must be lightweight and must not wait for the five-minute
Management cycle. It may fetch market data concurrently, but any balance or
position modification must still use the existing serialized execution path.

The Risk Sentinel is not Coin Management:

- It must not remove symbols from the configured coin list.
- It controls temporary runtime permission to enter or add risk.
- Existing positions remain visible and managed.
- Live and sandbox maintain separate persisted protection state.

The first version covers a market-wide downward crash. Its detector and state
machine should keep direction explicit so a later upward-crisis detector can
mirror the behavior for a portfolio exposed to SHORT positions.

## Market Data

The detector should use:

1. BTC perpetual-futures one-minute candles when trading futures.
2. BTC spot one-minute candles when trading spot.
3. One-minute candles for the configured non-BTC symbols to calculate market
   breadth.
4. Only candles that were closed and visible at the evaluation time.

BTC is the primary market trigger. Altcoin breadth confirms that the event is
systemic instead of a BTC-only movement or bad price tick.

The first implementation should not depend on a completed vPoint. VPoints may
be stored as supporting diagnostics, but their confirmation delay makes them
unsuitable as the primary black-swan trigger.

### Closed-candle drawdown

For each configured time window:

```txt
baseline = highest closed one-minute close before the latest closed candle
current = latest closed one-minute close
drawdownPct = ((current - baseline) / baseline) * 100
```

The baseline and current price must come from the same exchange, market type,
and symbol. Do not mix mark price, last trade, spot price, or candles from
different exchanges in one calculation.

Using closed-candle closes avoids triggering from one unconfirmed wick. The
system still records the candle low for diagnostics and slippage analysis.

### Altcoin breadth

For every eligible non-BTC symbol with valid data, calculate drawdown using the
same window. Then calculate:

```txt
breadthPct = symbolsAtOrBelowAltDrawdown / symbolsWithValidData * 100
```

Breadth must require a configurable minimum number of valid symbols. Missing or
stale data must not be counted as a falling coin or silently treated as a safe
coin.

### Runtime load control

Normal operation should fetch or refresh only the BTC one-minute window. Do not
fetch one-minute candles for every configured altcoin every minute while the
state is healthy.

Fetch altcoin breadth data only after a BTC warning threshold is reached. Reuse
the shared candle cache, coalesce concurrent requests, cap exchange-request
concurrency, and request only the small window required by the detector. One
minute of valid cached breadth data may be shared by live/sandbox consumers as
market evidence, while their resulting protection states remain separate.

If fresh BTC data is unavailable beyond a configured maximum age, enter
`WATCH` with reason `DATA_STALE`. This fail-closed state blocks new risk but
must not perform an emergency exit without valid crash evidence.

## State Machine

### `NORMAL`

- Normal entry, exit, and averaging behavior continues.
- The sentinel records its latest healthy evaluation.

### `WATCH`

The BTC warning threshold has been reached, but the hard BTC threshold or
systemic breadth confirmation has not yet been reached.

- Block all automatic and forced new entries.
- Pause all averaging executions.
- Continue PnL refresh and every risk-reducing exit.
- Do not consume, release, or change an averaging step merely because the
  system entered `WATCH`.
- Send one notification when entering the state, not one notification per coin
  per minute.

Pausing both LONG and SHORT averaging is intentional. A crash can reverse
violently, and increasing either side during dislocated liquidity adds risk.

### `CRISIS`

The hard BTC trigger is reached, or BTC warning plus systemic altcoin breadth
is confirmed.

- Keep all entries and averaging blocked.
- Cancel known pending risk-increasing entry and averaging orders when the
  exchange adapter supports safe cancellation.
- Continue or initiate the configured emergency exit policy.
- Use reduce-only orders for futures exits where supported.
- Never turn a failed close into a new position in the opposite direction.
- Preserve each attempted action, exchange response, fill, and failure for
  audit.

### `RECOVERY`

The immediate trigger is no longer active, but automatic risk taking remains
blocked during a cooldown.

- Continue monitoring and exits.
- Keep entry and averaging paused.
- Return to `NORMAL` only after the recovery rule passes.
- Manual acknowledgement should be required by default for live mode.
- Sandbox may support automatic recovery for testing.

## Trigger Rules

All percentages use percentage points, for example `8` means `8%`.

Recommended initial values for backtest calibration, not final production
defaults:

```ts
interface BlackSwanConfig {
  enabled: boolean;

  btcWarning: {
    fiveMinuteDrawdownPct: number; // recommended starting value: 4
    fifteenMinuteDrawdownPct: number; // recommended starting value: 6
  };

  btcHardTrigger: {
    fiveMinuteDrawdownPct: number; // recommended starting value: 8
    fifteenMinuteDrawdownPct: number; // recommended starting value: 10
    sixtyMinuteDrawdownPct: number; // recommended starting value: 14
  };

  breadthConfirmation: {
    windowMinutes: number; // recommended: 5
    altDrawdownPct: number; // recommended starting value: 8
    affectedSymbolsPct: number; // recommended starting value: 50
    minimumValidSymbols: number; // recommended: 5
  };

  maxDataAgeMinutes: number; // recommended: 2
  exitPolicy: "FREEZE_ONLY" | "CLOSE_ADVERSE" | "FLATTEN_ALL";
  recoveryCooldownMinutes: number; // recommended starting value: 60
  requireManualLiveRecovery: boolean; // recommended: true
}
```

The scheduling cadence is runtime orchestration rather than strategy evidence,
so it is stored separately as `blackSwanStageIntervalMinutes` (default `1`).

The configured values should be positive numbers. `enabled = false` disables
the feature. Individual `0` thresholds should not be accepted because a zero
drawdown would keep the guard continuously active.

Drawdown calculations are negative. A configured positive threshold is reached
when `drawdownPct <= -configuredThreshold`. For example, a five-minute BTC
drawdown of `-4.2%` reaches a configured warning value of `4`.

### `WATCH` activation

Enter `WATCH` when any BTC warning threshold is reached.

### `CRISIS` activation

Enter `CRISIS` immediately when either condition is true:

1. Any BTC hard trigger is reached; or
2. A BTC warning trigger is active and the altcoin breadth confirmation passes.

The hard BTC path intentionally does not wait for breadth. Waiting for many
altcoins to fall can make the protection react only after the portfolio has
already suffered most of the move.

One isolated altcoin crash must never activate the global state without a BTC
trigger. Coin-specific risk belongs to the existing position and Coin
Management rules.

## Emergency Exit Policy

The exit action must be configurable because freezing risk and immediately
closing every position have different trade-offs.

### `FREEZE_ONLY`

- Stops entries and averaging.
- Leaves open positions to their existing exit rules.
- Lowest behavior change, but it does not prevent correlated stop losses.

### `CLOSE_ADVERSE` (recommended first production policy)

- During a downward BTC crisis, close LONG futures positions and sell managed
  spot positions.
- Do not add to SHORT positions.
- Existing profitable SHORT positions remain under normal risk-reducing exit
  rules.
- If support for an upward black-swan or short-squeeze detector is added, the
  direction is mirrored and adverse SHORT positions are closed.

This policy directly addresses the reported market-wide downward crash without
throwing away profitable hedge exposure.

### `FLATTEN_ALL`

- Close every managed open position, including profitable hedges.
- Provides the strongest reduction of exchange and reversal exposure.
- Can realize unnecessary losses and lose protection from profitable SHORT
  positions.

Emergency closes should be prioritized by risk, not symbol order:

1. Highest liquidation proximity or margin risk.
2. Highest leverage.
3. Largest position margin or notional exposure.
4. Lowest known liquidity.

The first implementation may use a simpler deterministic order if liquidation
distance is not yet available, but the limitation must be visible in logs.

V1 currently uses the persisted trade-settings order because liquidation
distance and normalized liquidity are not yet available across every exchange
adapter. The Risk Sentinel summary and Black Swan notification record the
selected emergency-exit symbols; risk-ranked ordering remains a V2 item.

## Ordering With Existing Trading Stages

The latest persisted black-swan state must be checked at the final execution
boundary, not only when signals are created.

Required ordering:

1. Risk Sentinel evaluates closed candles and persists its state.
2. A trading stage reloads the latest state before executing.
3. Existing position exits are allowed first.
4. Emergency exits are applied according to policy.
5. Averaging is rejected in `WATCH`, `CRISIS`, and `RECOVERY`.
6. New entry is rejected in `WATCH`, `CRISIS`, and `RECOVERY`.

This second execution-boundary check prevents an entry signal prepared before
the sentinel activated from opening a position afterward.

Manual entry bypass must not bypass black-swan protection. An explicit separate
administrator action may temporarily override it, but the action must include
a reason and be logged.

## Persistence

Persist compact state separately for live and sandbox. A compatible shape is:

```ts
interface BlackSwanState {
  status: "NORMAL" | "WATCH" | "CRISIS" | "RECOVERY";
  t: number; // latest evaluation
  since: number; // time current state began
  reason: string;
  evidence?: {
    btc: Partial<
      Record<
        5 | 15 | 60,
        {
          t: number;
          pct: number;
          baseline: number;
          current: number;
          low: number;
        }
      >
    >;
    breadth?: {
      valid: number;
      affected: number;
      pct: number;
      thresholdPct: number;
      requiredPct: number;
      windowMinutes: number;
    };
  };
  recoverySince?: number;
  acknowledgedAt?: number;
}
```

Restarting the process must not reset `WATCH`, `CRISIS`, or `RECOVERY` to
`NORMAL`. Failure to fetch new market data must preserve the last protective
state until recovery can be proven from valid fresh data. Stale data while in
`NORMAL` follows the `DATA_STALE` fail-closed rule and may enter `WATCH`, but it
must never fabricate a `CRISIS` transition.

## Recovery

Leaving crisis mode must be deliberately slower than entering it.

Recommended recovery rule:

- The hard BTC trigger is inactive.
- BTC warning thresholds are inactive.
- Altcoin breadth is below its trigger.
- All required data is fresh.
- The conditions remain healthy for the entire configured cooldown.
- Live mode has been manually acknowledged when
  `requireManualLiveRecovery = true`.

Any new warning during the cooldown resets the recovery timer. The system must
not immediately average an old position when returning to `NORMAL`; its normal
watch guards must evaluate a newly visible eligible vPoint and current balance.

## Notifications and UI

Add a dedicated `Black Swan Action` notification type. It should include:

- Mode: live or sandbox.
- Previous and current state.
- Trigger rule and measured BTC drawdown.
- Breadth counts and percentage when available.
- Entry and averaging guard status.
- Selected exit policy.
- Attempted, successful, and failed emergency exits.
- Timestamp and data freshness.

The dashboard should show a persistent high-visibility Risk Sentinel decision
section in the same dashboard column as Entry Signals, immediately above Entry
Signals. It remains visible in `NORMAL` so the operator can see when the
detector last decided conditions were healthy. In `WATCH`, `CRISIS`, or
`RECOVERY`, the section must show why risk is blocked and whether live recovery
requires acknowledgement. It should also show when the current state began,
the latest evaluation time, evaluation cadence, and available BTC and breadth
evidence. Do not place it as a global top alert or represent it only as a toast
because the state can survive a browser refresh or process restart.

## Dedicated Candle Backtest

Black Swan replay lives on `/dev/black-swan`, separate from
`/dev/dynamic-trade`. This is a deliberate data-integrity boundary: Dynamic
Trade uses compact vPoints, while crash detection requires raw one-minute
candles.

The dedicated page and production use the same pure detection and
state-transition calculations. It downloads or reuses compact cached Binance
USDT perpetual-futures one-minute candles, includes a 65-minute warm-up, limits
one run to seven days and 30 symbols, and shows BTC price, detector evidence,
state bands, and an explicit transition table.

- Use only closed candles available at the current simulated timestamp.
- Never inspect a future candle, future vPoint, future low, or final incident
  result.
- Preserve the state transitions and reasons in the result for chart/debug UI.

The dedicated candle page remains a detector replay. It does not claim full
portfolio execution, slippage, averaging, or order-book fill accuracy.

The dashboard Settings preview adds a vPoint-driven savings comparison:

- The resource-intensive preview is opt-in and hidden by default. Opening the
  Black Swan settings tab alone must not call the preview endpoint. The
  operator must enable `Load Black Swan live preview`; hiding it unmounts the
  preview and cancels its request. The API propagates a disconnected request
  through candle loading and the quick-backtest loop, suppresses TradeLog
  output for that scoped calculation, and restores the logger in cleanup on
  success, failure, or cancellation.

TC: `PROD:BLACK_SWAN_SAVINGS_PREVIEW_RESOURCE_GUARD`

- Start and end use local-time inputs and identify the incident-search range.
  They default to the October 2025 incident. The same seven-day limit applies.
- The worst BTC five-minute drawdown inside that selected range is the incident
  anchor. Finding this anchor is independent of whether the draft Black Swan
  policy is enabled or reaches `CRISIS`.
- The preview loads Binance USDT perpetual-futures five-minute candles from 30
  days before through 30 days after that anchor. It calls the existing shared
  `detectVolatilityPoints` function without changing, copying, or specializing
  the vPoint algorithm.
- The generated vPoint arrays are passed to the standard SLOW backtest runner
  together with the complete current draft Trading configuration. That pass is
  used only to identify real entry candidates at the configured minimum
  actionable absolute level (for example, `L-1` when the minimum is `1`) and
  to retain its entry sizing and leverage. Its completed averaging executions
  and exit are not reused by the protection replay.
- For each configured symbol, the candidate is its latest real entry at the
  configured minimum absolute level before the first `CRISIS` transition, or
  before the incident anchor when the draft policy does not reach `CRISIS`.
  Candidate selection does not require the coarse vPoint backtest position to
  remain open at the incident. Starting from only its initial entry lot, the
  preview independently flows through every completed one-minute candle until
  the selected range ends or the position exits. It re-evaluates the shared
  backtest exit policy and checks the direction-adverse candle
  extreme first (`low` for LONG, `high` for SHORT), then the candle close, so a
  recovered wick through stop or liquidation is not ignored. A traditional
  stop, volatility-target stop/TP, post-average rescue exit, or isolated
  liquidation that occurs first closes the position before Black Swan
  protection can act. It never invents a position to make the preview
  non-empty. At most 20 candidates are returned.
- The unchanged vPoint generator timestamps a point at its earlier pivot, but
  the point is not visible to production until a later closed five-minute
  candle completes the detector's `1%` reversal. The preview records that
  confirmation time separately without changing the generated vPoint object.
  Entry and averaging execute at the newest closed one-minute price visible at
  confirmation time, not at the pivot price. Therefore a prospective add does
  not happen when its vPoint has not confirmed before an exit or `CRISIS`.
  If a confirmed adverse point remains the latest point, later monitoring
  minutes may reconsider an initially rejected next step at their then-current
  executable price, matching production watch behavior.
- Averaging state is rebuilt from the initial entry margin and the current
  reserve, maximum-next-level, multiplier, adaptive-averaging, and rescue-guard
  configuration. A confirmed adverse point may consume only the next eligible
  watch step. The same shared rescue-projection calculation decides whether
  that executable price is acceptable.
- For every closed minute, an existing exit strategy or liquidation is checked
  before an averaging add and before the Black Swan emergency exit. If no rule
  exits the position earlier, the configured emergency policy may close it at
  first `CRISIS`; a position still open at the selected end is finalized there.
- For each incident position, retain the vPoint slice beginning five vPoints
  before its entry and ending five vPoints after the later of its actual exit
  or the first `CRISIS`, when those surrounding points exist.
- Fetch and return raw one-minute candles only for that focused position
  window. The browser receives real one-minute OHLC values rather than
  downsampled or synthesized candles. BTC keeps the selected incident window.
- The UI reuses the production level-sequence chips and removes averaging
  executions that fall after the position's actual exit. Each chart shows
  its focused T/B vPoints, including each vPoint level, movement percent, and ID
  hash using the compact `T/B[level] pct% - id` marker format. It also
  shows the simulated executable entry, confirmed pre-exit averaging
  executions, first `CRISIS`, actual earliest exit, and pre-exit weighted entry
  as a dashed line. It does not plot the unprotected exit. Every chart has a
  client-side `1m` / `5m` display switch; the switch aggregates returned
  one-minute OHLC candles and never changes the five-minute vPoint generation
  source.
- Each position card shows only its actual protected-timeline PnL in USDT and
  percent. The value includes the standard backtest entry/add and exit fees.
  The percent uses the notional active at exit as its denominator, except that
  liquidation follows the shared backtest convention and displays `-100%`.
- The portfolio summary includes an exit-reason pie chart using each simulated
  position's earliest actual protected-timeline exit. Compact chips below the
  chart use the canonical `REASON[count]` format.
- `USDT saved = protected final net PnL - unprotected final net PnL`. This
  direct outcome comparison remains meaningful when either replay is
  profitable; a negative result is shown as additional loss/profit sacrificed
  rather than being presented as savings. Fee accounting follows the standard
  backtest entry/add and exit fee conventions.
- Historical slippage, exchange failure, reduce-only rejection, and order-book
  gaps remain outside this replay and must not be presented as simulated facts.

This preview intentionally combines two existing data boundaries: five-minute
candles create trading vPoints and their confirmation schedule, while
one-minute candles provide executable prices, drive Black Swan detection, and
evaluate the focused execution timeline. The vPoint generation function
remains unchanged and is still the single source of truth for pivots.

The October 2025 case should become a permanent regression dataset containing
BTC plus a representative set of the configured altcoins. The test should
begin before the crash so it also proves the detector does not use future data.

Compare at least:

- Portfolio net PnL.
- Maximum portfolio drawdown.
- Number of positions reaching normal stop loss.
- Margin added through averaging during the event.
- New positions opened after the first warning.
- Emergency-exit slippage and fees.
- Recovery and re-entry time.

## Required Tests

### Shared behavior

- A normal BTC move below every warning threshold does not change behavior.
- BTC warning enters `WATCH`, blocks entry, and blocks averaging.
- A hard BTC drawdown enters `CRISIS` without waiting for breadth.
- BTC warning plus sufficient altcoin breadth enters `CRISIS`.
- One collapsing altcoin without a BTC trigger does not activate the global
  guard.
- Missing or stale breadth data does not fabricate confirmation.
- Existing exit and force-exit actions still run while risk-increasing actions
  are blocked.
- A blocked averaging attempt does not consume or release its watch step.
- A signal prepared before activation is rejected at the execution boundary.
- Recovery requires fresh healthy data for the complete cooldown.
- A new warning resets recovery.

TC: `BOTH:BLACK_SWAN_DETECTION`

TC: `BOTH:BLACK_SWAN_ENTRY_GUARD`

TC: `BOTH:BLACK_SWAN_AVERAGING_GUARD`

TC: `BOTH:BLACK_SWAN_RECOVERY`

### Production and sandbox

- The sentinel interval is independent from Capture Entry, Standard
  Monitoring, and Management intervals.
- Live and sandbox states cannot overwrite each other.
- Restart preserves an active protective state.
- A failed exchange fetch does not reset protection.
- Futures emergency exits are reduce-only where supported.
- Manual bypass cannot silently override the guard.

TC: `PROD:BLACK_SWAN_RISK_SENTINEL`

TC: `PROD:BLACK_SWAN_STATE_PERSISTENCE`

TC: `PROD:BLACK_SWAN_EMERGENCY_EXIT`

### Backtest

- Detection uses no candle newer than the simulated time.
- The October 2025 fixture activates protection before the normal correlated
  stop losses, when the configured thresholds permit it.
- Disabled protection reproduces the baseline behavior.
- Enabled protection records its state changes and actions in the result.

TC: `BTEST:BLACK_SWAN_NO_LOOKAHEAD`

TC: `BTEST:BLACK_SWAN_OCT_2025_REGRESSION`

TC: `BTEST:BLACK_SWAN_SAVINGS_PREVIEW`

## Implementation Boundaries

The implementation should remain separated:

- A pure detector and state machine shared by backtest and production.
- Production orchestration, candle fetching, persistence, order cancellation,
  notifications, and manual acknowledgement under `src/lib/slowTrading/**`.
- Entry, averaging, and emergency-exit execution guards under
  `src/lib/trading/execute/**`.
- Exchange-specific reduce-only and cancellation behavior under
  `src/lib/exchange/**`.
- Candle-driven replay and reporting under
  `src/lib/devBacktest/black-swan/**` and
  `src/components/dev/BlackSwanBacktest/**`.

Do not implement the feature as scattered checks in only the dashboard or only
the production cycle. The execution-boundary guards must be authoritative even
when a signal was created by another stage or API request.

## Recommended Implementation Order

1. Capture and validate the October 2025 closed one-minute candle fixture.
2. Implement the pure detector and state transitions with no trading actions.
3. Add persisted live/sandbox state, notification, and dashboard visibility.
4. Add entry and averaging execution-boundary guards.
5. Add `FREEZE_ONLY` and validate it in backtest.
6. Add `CLOSE_ADVERSE` with reduce-only production execution.
7. Consider `FLATTEN_ALL` only after slippage and failure handling are tested.

The safest first release is detection plus `FREEZE_ONLY`. It prevents the
system from increasing exposure during a systemic crash while the emergency
exit implementation is tested separately.
