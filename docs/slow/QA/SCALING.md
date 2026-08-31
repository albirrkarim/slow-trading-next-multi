# SLOW Scaling

Assessment date: July 1, 2026.

## Scaling Score

```text
88/100
```

Current condition:

- 80 configured coins is good in production.
- `/api/dashboard/volatility` is healthy at the current production size.
- Production observation: 80 coins returned dashboard volatility in about
  `222ms`.
- Production observation: 80 coins completed a runner cycle in about `12s`.
- Railway CPU and memory look healthy after the latest dashboard/table/cache
  optimizations.
- Latest Volatility Points is paginated and has enough computed columns for
  operational scanning without needing virtualization yet.
- The runner is comfortably inside the 5-minute scan cadence at 80 coins.
- The profiler makes cycle duration visible in the navbar, so regressions should
  be easier to catch.

Current production baseline:

```text
80 configured coins: dashboard volatility about 222ms
80 configured coins: runner cycle about 12s
```

Readiness:

```text
50-80 symbols: good for current production use
100 symbols: likely OK, but save profiler measurements first
200+ symbols: not proven until runner duration and chart bounds are measured
```

## Scaling Action TODO

### 1. Watch Runner Cycle Duration

Priority: high.

The cycle is currently good at 80 coins. Keep using the profiler as the source
of truth before doing more runner optimization.

TODO:

- Save real 80-coin cycle timings from the profiler:
  - signal build
  - model-memory assignment
  - volatility assignment
  - exchange balance/position calls
  - latest price calls
  - trade execution
  - reporting sync
  - cache persistence
  - mode-state persistence
- Log slow symbols and slow exchange calls.
- Confirm `assignVolatility()` runs only once per cycle path.
- Batch or bound-concurrently fetches only if profiler data shows exchange calls
  are the next bottleneck.
- Keep empty and low-level volatility sync throttling:
  - empty no-point memory: 6 hours
  - level `0`: 6 hours
  - absolute level `1`: 4 hours
  - absolute level `2+`: normal cycle
- Show a dashboard warning when `lastRunDurationMs` approaches or exceeds the
  configured scan interval.

### 2. Save Scaling Measurements

Priority: high.

TODO:

- Save benchmark results for:
  - 50 symbols
  - 80 symbols
  - 100 symbols
  - 150 symbols
  - 200 symbols
  - 300 symbols
- Record:
  - runner cycle duration
  - profiler section breakdown
  - `/api/slow-trading/storage` duration and response bytes
  - `/api/dashboard/initialize` duration
  - `/api/dashboard/volatility` cold duration
  - `/api/dashboard/volatility` cached duration
  - browser responsiveness after opening `/slow`
  - Railway CPU and memory
- Store results under `storage/tmp/scaling-*`.

### 3. Add Payload And Duration Logging

Priority: medium.

TODO:

- Log `symbols`, duration, response bytes, and cache hit/miss for
  `/api/dashboard/volatility`.
- Log duration and response bytes for `/api/slow-trading/storage`.
- Log duration for dashboard initialize steps:
  - 24-hour volume refresh
  - market-cap refresh
  - missing volatility rebuild
  - price-norm generation
- Keep runner cycle profiler labels visible enough for production diagnosis.

### 4. Bound Main Chart Rendering

Priority: medium.

The Latest Volatility Points table is no longer the browser risk. The remaining
frontend risk is the main chart receiving every loaded symbol series and trade
overlay series for the selected dashboard range.

TODO:

- Add visible-symbol controls before building chart series:
  - search
  - selected tags
  - open positions
  - actionable latest levels
  - pinned symbols
- Default the chart to a bounded subset.
- Make "show all" an explicit heavy action.
- Keep Latest Volatility Points independent from chart visibility.

### 5. Watch Dashboard Storage Size

Priority: medium.

`/api/slow-trading/storage` currently hydrates history for dashboard reporting.
That is correct for the full dashboard, but history can become a payload and
memory hotspot as closed history grows.

TODO:

- Measure storage response bytes first.
- Keep the current endpoint if the payload remains small enough.
- If it grows too large, split dashboard loading into:
  - lightweight state for navbar, open positions, and config
  - history/reporting payload only when reporting is visible
- Keep production runtime paths on active-mode storage without history
  hydration unless they explicitly need history.

### 6. Clarify Latest Point Semantics

Priority: low.

Latest Volatility Points currently means "latest point from the loaded
dashboard range", not guaranteed latest persisted point across all time.

TODO:

- Decide whether the table should always show the true latest persisted point.
- If yes, return the selected chart range plus each symbol's latest point, or
  add a separate lightweight latest-points endpoint.
