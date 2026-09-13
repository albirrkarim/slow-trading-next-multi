# Binance REST Runtime Budget and Health

This document is the source of truth for Binance REST activity produced by the
SLOW live runtime. It covers scheduled stages, dashboard reads, execution, the
request coordinator, and cooldown health. All cadences below are defaults;
positive whole-minute runtime settings can override stage intervals.

## 1. Incident assessment (13 September 2026)

The production monitoring snapshot contained 67 cooldown errors. They were
distributed as follows:

| Source | Count |
| --- | ---: |
| `slow-trading.dashboard.live-balance` | 49 |
| `runner.tick.speedup` | 7 |
| `runner.tick.risk-sentinel` | 7 |
| `cycle.account.1` | 2 |
| `runner.tick.standard-monitoring` | 1 |
| `runner.tick.capture-entry` | 1 |

The important signature was repeated calls during the same Binance ban. For
example, Speedup calls at 00:27Z and 00:43Z both received the same
`banned until 1789268394983` response. Dashboard balance failures continued in
pairs and approximately every ten minutes while the ban was already active.
Later probes first created a short ban and then extended it to more than three
hours.

Root cause: the coordinator's queue, request-weight counters, and cooldown were
module-local variables. Next.js server route bundles, process reloads, or other
runtime workers could therefore load separate coordinator instances. A route
that did not know another route had entered cooldown called Binance again,
rediscovered the same ban, emitted another error/notification, and could extend
the IP ban. The paired probes are consistent with the two enabled account
balance reads and can be multiplied further by multiple dashboard clients.

The fix makes coordinator state process-wide and makes cooldown state
persistent. Every REST request hydrates the persisted gate before its callback
is allowed to execute. Private balance is now lazy: monitoring evaluates exits
and averaging candidates first, then fetches balance only when funds are
actually needed for entry or averaging authorization.

TC: `PROD:BINANCE_PERSISTENT_COOLDOWN`

TC: `PROD:BINANCE_BALANCE_REQUEST_BUDGET`

TC: `PROD:LAZY_BALANCE_REFRESH`

## 2. Scheduled stages and collision rules

| Stage | Default cadence | Binance work |
| --- | ---: | --- |
| Risk Sentinel / Black Swan | 1 minute | BTC 1m candles. Breadth candles only after BTC warning evidence. |
| Speedup | 1 minute | Market preparation and monitoring for positions matching a Speedup rule. |
| Standard Monitoring | 5 minutes | Market preparation and monitoring for open positions not owned by Speedup. |
| Management | 5 minutes | Stored volatility/market metadata rules; any refresh it invokes still uses the coordinator. |
| Capture Entry | 5 minutes | Market preparation, entry analysis, queue work, and possible order execution. |

The runner starts each loop immediately. Speedup, Standard Monitoring, and
Capture Entry pass through the runner's stage queue and cannot overlap one
another. A position is assigned to Speedup or Standard Monitoring, never both,
for one classification pass.

Risk Sentinel and Management have independent timers and can overlap another
stage at the task level. Black Swan analysis therefore can coincide with a
Speedup or Standard pass. This is intentional: the Binance request coordinator
serializes the actual REST callbacks, observes request weight, and enforces the
shared persistent cooldown before any callback. Black Swan evidence is shared
once across all accounts.

TC: `PROD:SPEEDUP_STAGE`

TC: `PROD:STANDARD_MONITORING_STAGE`

TC: `PROD:BINANCE_REQUEST_COORDINATOR`

## 3. Black Swan request cadence

- BTC is checked on every enabled Risk Sentinel pass: every 1 minute by
  default (`blackSwanStageIntervalMinutes`).
- The request is one 1-minute kline window from the previous 65 minutes, with
  `limit=70`.
- The BTC candle promise/value is cached for 55 seconds, coalescing live and
  sandbox consumers inside that freshness window.
- Breadth is not fetched during normal BTC conditions.
- If the first BTC evaluation reaches a warning threshold, configured symbols
  other than BTC are fetched using the same 1-minute/65-minute/70-candle shape.
- Breadth uses at most four application workers, but all resulting Binance REST
  callbacks still pass through the single coordinator queue.

Thus Black Swan normally costs one kline request per minute: futures weight 1
or spot weight 2 for `limit=70`. Its exceptional warning path costs up to one
additional request at the same weight per non-BTC configured symbol.

TC: `PROD:BLACK_SWAN_SHARED_EVIDENCE`

## 4. Cycle request inventory

Public market preparation is performed once per stage and reused sequentially
by all enabled accounts.

| Runtime operation | Endpoint or adapter call | When/cadence | Cache/coalescing |
| --- | --- | --- | --- |
| Volatility synchronization | Futures `/fapi/v1/klines`; spot `/api/v3/klines` | Once for each selected symbol in each eligible stage cycle; incremental range is decided by stored prediction memory | In-flight shared stage preparation and prediction-memory throttling |
| Stage clock candle | Klines for the first selected symbol, 5m interval | Each eligible stage cycle | Until the next aligned 5-minute boundary |
| Position-sync price | Klines, 5m interval | Each selected live open-position symbol before private position reconciliation | 5-second per-symbol latest-price cache plus stage single-flight |
| Reporting price | Klines, 5m interval | Each monitored position symbol | Separate 5-second per-symbol cache plus stage single-flight |
| Latest decision-v19 context | Klines through `buildLatestKlineBySymbol` | Capture-entry preparation when decision engine v19 is active | Stage-shared result |
| Funding rate | Futures `/fapi/v1/premiumIndex` without a symbol | When futures reporting needs funding | One all-symbol response cached 5 minutes |
| 24-hour volume | Futures `/fapi/v1/ticker/24hr` or spot `/api/v3/ticker/24hr` without a symbol | Entry context/dashboard initialization | One all-symbol response cached 10 minutes and persisted |
| Entry authorization balance | Futures `/fapi/v2/balance` or spot `/api/v3/account` | Once per live account pass only when at least one entry signal survives the final guards | Reused by all serialized entry candidates; local value is adjusted after each successful order |
| Averaging authorization balance | Same balance endpoint | Once per live monitoring pass only when at least one averaging candidate exists | Reused by all serialized averaging candidates; no call for exit-only or ordinary monitoring |
| Open futures positions | `/fapi/v2/positionRisk` | Live futures account cycle with selected open positions | Once per account pass |
| Final account balance | Same balance endpoint | Only after a report confirms `BUY` or `SELL` | Skipped for monitoring-only/no-order cycles |

Empty monitoring stages do no public or private exchange I/O.

With multiple accounts, public market preparation remains one shared stage
snapshot. Balance and position-risk requests remain private and execute
sequentially. Position risk is synchronized when required by live futures
positions. Balance is not periodic: it is requested only at an entry/averaging
authorization boundary and after a successful order.

TC: `PROD:SHARED_MARKET_SINGLE_FLIGHT`

TC: `PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE`

TC: `PROD:EMPTY_MONITORING_NO_MARKET_IO`

TC: `PROD:LAZY_BALANCE_REFRESH`

## 5. Order and account-operation requests

These requests are conditional rather than periodic:

| Operation | Binance endpoint(s) | Trigger |
| --- | --- | --- |
| Futures order | `/fapi/v1/order` | Confirmed entry, averaging, exit, or forced exit |
| Futures leverage/margin setup | `/fapi/v1/leverage`, `/fapi/v1/marginType` | Futures execution setup when required |
| Spot order | `/api/v3/order` | Confirmed spot entry or exit |
| Open orders | `/fapi/v1/openOrders` where used | Order reconciliation/cancellation flow |
| Execution price context | Klines | Entry, averaging, and exit calculations when the execution module requires a current candle |
| Account permissions | `/sapi/v1/account/apiRestrictions` | Withdrawal capability validation |
| Asset/network config | `/sapi/v1/capital/config/getall` | Withdrawal/network validation |
| Internal transfer | `/sapi/v1/asset/transfer` | Funding-account transfer required by withdrawal flow |
| Withdrawal submission | `/sapi/v1/capital/withdraw/apply` | Confirmed manual or scheduled withdrawal |
| Margin account/order calls | `/sapi/v1/margin/*` | Margin-mode operations only |

All calls above, including direct derivatives analytics, use the same public or
private Binance request helper and therefore the same queue and cooldown gate.

## 6. Dashboard requests

- The dashboard storage endpoint loads once on page load and then every
  10 minutes per open browser client, but its balance values come only from
  persisted runner memory. Opening, reloading, or polling the dashboard does
  not request a private Binance balance.
- Each enabled live account has a small manual balance-refresh control in the
  navbar. One click makes one private balance request for that account, updates
  its persisted live memory, and reloads the storage-backed dashboard state.
- Manual balance refresh is unavailable for sandbox accounts and while the
  persistent Binance cooldown is active.
- It requests a small 1-minute kline set for each distinct open-position symbol
  to refresh floating PnL. Those callbacks are also blocked during cooldown.
- Dashboard initialization can refresh the 24-hour all-symbol ticker snapshot
  (10-minute cache), the funding snapshot (5-minute cache), and volatility data
  when stale.

Browser clients do not own request coordination. Their server-side Binance
callbacks all join the process-wide queue and read the persistent cooldown gate.

TC: `PROD:DASHBOARD_PERSISTED_BALANCE`

TC: `PROD:MANUAL_ACCOUNT_BALANCE_REFRESH`

## 7. Coordinator weight budget

The coordinator estimates the request weights used by this application:

| Endpoint | Estimated weight |
| --- | ---: |
| Futures klines, `limit < 100` / `< 500` / `<= 1000` / greater | 1 / 2 / 5 / 10 |
| Spot klines | 2 |
| Futures 24h ticker, symbol / all symbols | 1 / 40 |
| Spot 24h ticker, symbol / all symbols | 2 / 80 |
| Futures premium index, symbol / all symbols | 1 / 10 |
| Futures balance | 5 |
| Futures position risk | 5 |
| Futures open orders, symbol / all symbols | 1 / 40 |
| Spot account | 20 |
| SAPI default | 10 |

The working limits are 2,400 weight/minute for the futures host and 6,000 for
the spot host. The base inter-request gap is 350ms. At 70% observed/estimated
usage it increases to 1 second; at 85% it increases to 2 seconds; at 90% the
request waits for the next minute window. `X-MBX-USED-WEIGHT-1M` response values
raise the coordinator's local observed usage when they exceed its estimates.

## 8. Persistent cooldown health

HTTP 418, HTTP 429, or Binance code `-1003` activates a hard gate. Its end is
the maximum of the `Retry-After` header, the `banned until` epoch in Binance's
message, and the two-minute fallback. No public or private REST callback may run
while the gate is active.

Cooldown incidents are stored compactly in
`slow/logs/binance_cooldowns.json`, bounded to 500 entries. One continuous ban
is one incident. Repeated detections update its latest end/reason/endpoint and
increment `occurrences` instead of creating notification spam. Each incident
stores:

- `t`: first detection time;
- `end`: latest allowed retry time;
- public/private request kind and endpoint;
- exact Binance reason, optional error/HTTP code, and occurrence count.

The Live Dashboard places **Binance REST Health** immediately below Black Swan
status. An active cooldown shows its start and end explicitly in Jakarta time,
remaining duration, trigger, exact reason, and recent incident logs. MCP
monitoring snapshots include the same bounded cooldown logs when `logs` is
requested.

TC: `PROD:BINANCE_GLOBAL_COOLDOWN`

TC: `PROD:BINANCE_PERSISTENT_COOLDOWN`

## 9. Position-monitoring health

Every open position displays a visible warning when its latest successful
Speedup/Standard monitoring timestamp is missing or more than 10 minutes old.
The tooltip shows the last timestamp and elapsed minutes. This is a health
signal: it does not itself mutate or close a position.

TC: `PROD:OPEN_POSITION_STALE_MONITORING_WARNING`
