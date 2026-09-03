# Production Cycle Architecture

Status: implemented production architecture.

This document defines how SLOW production stages should share public market
work across accounts while preserving account isolation for balances,
positions, orders, notifications, and persistence. It applies to production
live and sandbox execution. Backtest remains candle-driven and keeps its
existing execution flow.

## Architecture Summary

SLOW uses one Binance Futures market, one configured coin list, one strategy
configuration, and multiple private trading accounts.

```text
BEGIN CYCLE

prepare shared Binance Futures market data once

for each trading account sequentially
  load account state
  apply account guards
  fetch private balance and positions
  execute trades
  persist account state

END CYCLE
```

Public market analysis is shared. Private account decisions, exchange calls,
orders, and persistence remain isolated and sequential.

The implementation is organized under `src/lib/slowTrading/cycle/`:

- `coordinator.ts` owns shared preparation and sequential account iteration.
- `index.ts` executes one account against the prepared shared snapshot and
  exposes the queued public cycle API.
- `shared-market.ts` owns the per-cycle public market snapshot and lazy shared
  price, funding-rate, and 24-hour-volume loaders.
- `accounts.ts` loads eligible account scopes and combines their results.
- `planning.ts`, `entry.ts`, `monitoring.ts`, and `finalize.ts` retain focused
  account-stage responsibilities.
- `types.ts` defines the plan, runtime, request, and result boundaries.

## 1. Design Principle

A production stage has two different scopes:

1. Shared Binance Futures market preparation, executed once for the stage.
2. Account execution, executed sequentially for every eligible account.

The system must not execute the entire public market-analysis pipeline once per
account. Every trading account uses the same Binance Futures market, configured
coin list, and strategy inputs. It must also not share private account state or
order execution merely to save requests.

Conceptually:

```text
begin stage cycle

load the account catalog and required account states
collect symbols that have open positions or can capture entries

build or reuse one shared Binance Futures market snapshot

for each eligible account in deterministic order
  classify exact stage eligibility using account state and shared market data
  apply account-specific guards and decisions
  refresh required private exchange state
  execute account orders sequentially
  persist account state

end stage cycle
```

TC: `PROD:MULTI_ACCOUNT_SHARED_MARKET_PREPARATION`

TC: `PROD:MULTI_ACCOUNT_SEQUENTIAL_ACCOUNT_EXECUTION`

## 2. One Shared Market Context

SLOW has one shared market context:

- Exchange: Binance.
- Trading mode: Futures.
- Coin list: the shared configured symbols.
- Strategy and decision-engine configuration: shared by all accounts.

Therefore, every stage cycle builds at most one shared public market snapshot.
Account credentials do not create separate market contexts. Each account still
receives only the symbols eligible for its persisted positions and stage.

## 3. Shared Market Preparation

The shared phase owns public or account-independent inputs such as:

- Volatility/vPoint cache refresh.
- Public klines used for the stage time and market analysis.
- Price-normalization market inputs.
- Public 24-hour volume and market-cap snapshots.
- Public funding-rate snapshots.
- Black Swan BTC and market-breadth evidence.
- Raw market features or decision-engine candidates when they do not depend on
  account memory.

If a decision-engine step reads account positions, used vPoint ids, closed
history, balance memory, or another account-owned value, that step remains in
the account phase. Shared market data may be passed into it as immutable input.

The shared snapshot must be immutable after publication. Account processing
must not mutate the snapshot or attach account-owned state to it. Mutable model
memory must be cloned or built per account.

Volatility assignment remains sequential inside the one shared preparation.
That deliberate sequencing limits Binance request pressure; the efficiency gain
comes from removing duplicate account-wide runs, not from bursting symbol
requests in parallel.

## 4. Account-Specific Execution

The account phase owns:

- Active mode and stage classification from persisted account state.
- Open-position and used-vPoint filtering.
- Black Swan state transition and entry protection for the account.
- Daily-PnL entry guard and notification transition state.
- Private balance and exchange-position synchronization.
- Entry sizing, reserve planning, and Safe Haven balance.
- Fresh final entry-price guards.
- Entry, exit, and averaging orders.
- Emergency-exit selection from the account's open positions.
- Account notifications, history, cache, stage statistics, and mode-state
  persistence.

Accounts must execute sequentially in deterministic catalog order until the
system provides proven per-account mutation locks and a shared exchange rate
limiter. Reducing duplicate public requests must not be implemented by
parallelizing private trading calls.

Exit must retain priority over averaging. An account must never average a
position that the same pass just closed.

TC: `PROD:MULTI_ACCOUNT_PRIVATE_STATE_ISOLATION`

## 5. Stage Eligibility and Market I/O

The coordinator must first use account state to determine whether a stage has
any possible work. Exact Speedup and Standard classification may additionally
depend on shared volatility, so that partition happens after the shared market
snapshot is available and before any account execution begins.

### 5.1 Speedup and Standard Monitoring

When no eligible account owns an open position for the stage:

- Do not fetch public klines, volatility, prices, or funding for that stage.
- Do not call private balance or position endpoints.
- Persist the required compact successful empty-stage statistics for each
  account whose stage pass must be recorded.

When at least one account has an open position, Speedup and Standard
Monitoring prepare shared volatility once for the union of those open-position
symbols. Each account then classifies its positions against that same snapshot.
This ordering is required because volatility is stored in the shared
`slow/<exchange>/volatility/` cache and intentionally removed from compact
account memory after persistence. Stage classification must not treat that
missing transient account field as an empty volatility history.

TC: `PROD:EMPTY_MONITORING_NO_MARKET_IO`

TC: `PROD:SPEEDUP_STAGE_SHARED_VOLATILITY_CLASSIFICATION`

### 5.2 Capture Entry

Having no open position does not make Capture Entry empty. Configured symbols
without an open position are entry candidates.

Capture Entry must prepare shared market inputs once, then apply
account-specific entry filters, balance sizing, and execution to each enabled
account. A disabled account must not enter a new position.

### 5.3 Disabled Accounts

A disabled account with no open position may be skipped. A disabled account
with an open position must remain eligible for monitoring and exit handling,
while automatic entry remains disabled.

## 6. Black Swan Fan-Out

Black Swan processing must separate shared evidence from account effects.

```text
evidence = capture Binance Futures BTC and breadth evidence once

for each eligible account sequentially
  nextState = apply evidence to account.previousState
  persist the account's next state
  block account entry when the state is protective
  mark emergency exits from the account's positions
  send account transition notifications
```

Shared evidence includes BTC candles, breadth candles, timestamps, and other
market-wide facts. Account application remains necessary because accounts have
independent positions, persisted state, notification state, and recovery
acknowledgement.

An enabled account with no open positions must still receive the current
protective state so Capture Entry cannot open a position during a crisis. It
does not require emergency-exit work. A disabled account with neither entry
eligibility nor an open position may be skipped.

Suggested API:

```ts
blackSwan.evidence.capture(...)
blackSwan.account.apply(...)
```

TC: `PROD:BLACK_SWAN_SHARED_EVIDENCE`

TC: `PROD:BLACK_SWAN_ACCOUNT_STATE_FAN_OUT`

## 7. Freshness and Execution Boundaries

Sharing a market snapshot must not weaken final order safety.

Immediately before an entry or other balance-changing action, the account
phase must retain the existing final checks for:

- Latest shared runtime configuration and persisted account state.
- Current Black Swan protection or pending protection.
- Current daily-PnL entry limit.
- Current account balance and reserve state.
- Current open positions and used vPoint ids.
- Fresh execution-price requirements configured by Coin Management.
- Exchange precision, leverage, margin mode, and order validation.

A shared analysis snapshot can identify candidates, but it does not authorize
an order. Only the account execution boundary can authorize and submit it.

## 8. Single-Flight and Rate Limits

Concurrent consumers requesting the shared Binance Futures snapshot must join
one in-flight promise instead of starting duplicate network work. Consumers
may include:

- The production stage runner.
- Entry diagnostics.
- Dashboard diagnostics.
- Another stage requesting the same still-valid public snapshot.

The single-flight key must identify the requested shared-data kind, symbols,
configuration version, and data window. Completed results may use a short TTL
aligned with the underlying candle or exchange-data cadence. Failed promises
must be removed so a later pass can retry.

Public requests must retain bounded concurrency and exchange-aware rate
limiting. The architecture reduces calls by sharing work; it must not replace
sequential requests with an unbounded burst.

Completed public-market results use freshness windows that match the data:

- Black Swan candles: 55 seconds.
- Latest reporting and position-sync prices: 5 seconds.
- A completed five-minute stage candle: until the next aligned five-minute
  boundary. An in-progress candle is coalesced only while its request runs.
- Funding rates: 5 minutes.
- 24-hour volume: 10 minutes.
- Volatility refresh: in-flight coalescing only; completed memory follows the
  existing vPoint synchronization throttle and persistent cache.

The full shared snapshot is coalesced while preparation is in progress. Its
individual public inputs then follow the freshness windows above; the system
does not retain account decisions or order authorization in that snapshot.

TC: `PROD:SHARED_MARKET_SINGLE_FLIGHT`

### 8.1 Binance Request Coordinator

Every Binance public and private REST request in the exchange adapter must pass
through one in-process coordinator. The coordinator serializes REST work,
estimates the documented endpoint request weight, observes
`X-MBX-USED-WEIGHT-*` response headers, and slows or defers requests as the
current request-weight window approaches its limit.

The coordinator is below SLOW orchestration so independent cycle stages,
entry diagnostics, dashboard data, volatility refresh, and private account
execution cannot create separate uncoordinated Binance queues.

TC: `PROD:BINANCE_REQUEST_COORDINATOR`

### 8.2 Binance Global Cooldown

HTTP `429`, HTTP `418`, and Binance error code `-1003` activate one hard
cooldown for the running app instance. The coordinator uses `Retry-After` and
Binance's `banned until` timestamp when available, and otherwise applies a
safe fallback cooldown.

While the cooldown is active:

- No queued public or private Binance REST callback may execute.
- Scheduled Binance stages skip without emitting repeated operational-error
  notifications.
- Entry diagnostics return HTTP `503`, the message `Binance cooldown`, and the
  numeric `retryAt` timestamp without starting market analysis.
- The first rate-limit response emits the canonical cooldown error; callers
  observing the same cooldown do not create another Binance request.

TC: `PROD:BINANCE_GLOBAL_COOLDOWN`

### 8.3 Retry Classification

Rate-limit responses and invalid-symbol responses are never retried. Kline
fetching retries only temporary transport failures and HTTP `5xx` responses,
uses exponential backoff, and stops after three total attempts. Exhausted or
non-retryable failures abort the fetch instead of continuing with a partial
market history.

TC: `PROD:BINANCE_RATE_LIMIT_NO_RETRY`

## 9. Failure Isolation

A shared market-preparation failure belongs to the stage cycle. It must:

- Produce one canonical shared failure for the failed request.
- Avoid repeating the same immediate request once per account.
- Prevent all accounts from acting on missing or partial required shared data.

An account-specific failure must not roll back or prevent already independent
accounts from running. It must retain the existing account source identifier,
for example `cycle.account.<slug>`, and continue with the next account when it
is safe to do so.

Supplementary data that is already defined as non-fatal, such as funding used
only for monitoring display, must keep its existing fallback behavior.

Planned TC: `PROD:SHARED_MARKET_FAILURE_COALESCING`

Planned TC: `PROD:MULTI_ACCOUNT_FAILURE_ISOLATION`

## 10. Persistence and Mutation Ordering

Shared preparation must not persist account mode memory. Each account owns its
own mutation and persistence transaction.

For each account, the required order remains:

1. Load the latest account state inside the serialized execution boundary.
2. Apply the shared immutable market inputs.
3. Execute entry, then exit, then averaging according to stage permissions,
   with exit evaluated before averaging.
4. Refresh reporting state.
5. Persist caches and mode state so closed trades are archived.
6. Generate the daily report from archived history.
7. Persist notification transition state.
8. Record the balance snapshot.

Manual mutations and scheduled stages must continue using the SLOW mutation
queue so stale cycle state cannot overwrite a newer balance or position.

## 11. Performance Observability

Performance summaries must distinguish shared and account costs. The profiler
should expose enough information to answer:

- How long the single shared market preparation took.
- Whether the result was fetched, cached, or joined in flight.
- How long each account spent on guards, private exchange calls, execution,
  reporting, and persistence.
- How many network calls and symbols each shared section processed.

One slow shared request must not appear as independent full-duration work for
every account. Account totals may include waiting for the shared result, but
the underlying shared request count must remain one.

Planned TC: `PROD:CYCLE_SHARED_ACCOUNT_PERFORMANCE`

## 12. Compatibility Requirements

Implementing this architecture must preserve:

- Live and sandbox account isolation.
- Existing persisted storage shapes and compact JSON behavior.
- Existing stage ownership and cadence.
- Daily-PnL and notification transition behavior.
- Black Swan recovery and emergency-exit behavior.
- Sequential order and balance mutation safety.
- Disabled-account exit handling.
- Existing backtest behavior.

The migration is an orchestration refactor. It must not change trading
calculations or strategy thresholds merely to make sharing easier.
