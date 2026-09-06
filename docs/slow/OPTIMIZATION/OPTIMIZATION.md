# SLOW Production Optimization

This document tracks how to keep the SLOW Railway deployment clean, efficient, and production-focused.

## Optimization Score: 68/100

Assessment date: September 4, 2026.

The SLOW runtime has several meaningful optimizations: public market work is
shared across accounts, account cycles are sequential, empty monitoring stages
avoid market I/O, runtime storage loads only the active mode, and closed history
is split out of normal cycle memory. A cgroup-aware runtime memory monitor, cycle
section profiler, and an 80-symbol production-shaped functional test now exist.

The 100 MB Railway target is not currently met. The September 4 Railway graph
showed approximately `232 MB` for `Multi Grail : Sub Machine gun` and `151 MB`
for `Holy Grail : Sub Machine gun`. These are separate service series, not one
combined process measurement. At that sample the two services used roughly
`383 MB` in total.

The current V8 flags were previously described too much like a process-memory
cap. They are not. `--max-old-space-size` limits only V8 old-space; Railway
reports service RAM, which also includes the young heap, executable code, native
allocations, buffers, thread stacks, allocator overhead, and other resident
memory. A `96 MB` old-space limit therefore cannot guarantee a service stays
below `100 MB`.

The main rule:

```text
Production should only ship and run the SLOW dashboard, SLOW APIs, auth, storage, exchange execution, and notification logic.
Development backtest pages/APIs should not be available or loaded in Railway production unless explicitly enabled.
```

## Goals

- Keep Railway memory stable and low.
- Keep the standalone production bundle focused on `/slow`.
- Avoid accidental production access to heavy dev/backtest tools.
- Keep dev/backtest tools available locally.
- Make optimization decisions based on real runtime impact, not only build output cosmetics.

## Current Production Target

Desired steady-state Railway service memory:

```text
Target: <= 100 MB per service
Observed on September 4, 2026: 151-232 MB per service
Status: target not met
```

Railway production should run the standalone Next.js server:

```bash
node .next/standalone/server.js
```

Recommended Railway environment:

```bash
HOSTNAME=0.0.0.0
PORT=8080
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
PERSISTENT_STORAGE_ROOT=/storage/persistent/instances/3010
NODE_OPTIONS=--max-old-space-size=96 --max-semi-space-size=2
```

Treat these as V8 heap guardrails, not a Railway RAM limit. Do not lower them
only to make the graph approach 100 MB. A smaller old-space can increase garbage
collection and cause JavaScript heap out-of-memory failures while leaving most
of the framework/native RSS unchanged.

The previous conservative setting remains a fallback if the `96/2` setting
cannot finish representative cycles:

```bash
NODE_OPTIONS=--max-old-space-size=128 --max-semi-space-size=4
```

Do not claim either setting is safe until it finishes Capture Entry, Speedup,
Standard Monitoring, Black Swan, dashboard initialization, and withdrawal
scans with the production account and symbol counts.

## Why 96 MB Old-Space Can Show as 200+ MB

The important memory measurements are different:

```text
heapUsed
  JavaScript objects currently used by V8

heapTotal
  V8 heap currently committed

rss
  Whole Node process resident memory, including V8 and native/code memory

cgroup memory
  Container memory used for Railway monitoring and limits
```

`NODE_OPTIONS=--max-old-space-size=96` constrains only one portion of
`heapTotal`. It does not constrain `rss` or total cgroup memory to 96 MB.

The repository's runtime monitor already reads both `process.memoryUsage()` and
Linux cgroup usage. However, its notification currently reports only the total
`usedMb`. Until the alert/log includes `heapUsedMb`, `rssMb`, `usedMb`, source,
and container limit together, the Railway graph alone cannot prove whether the
extra memory is JavaScript retention, native/framework RSS, allocator behavior,
or container-accounted file cache.

Local reproduction on September 4, 2026 used Node `24.18.0`, Next `16.2.9`, the
standalone server, empty temporary storage, and the `96/2` flags. Sampled process
RSS was approximately `89-107 MiB` around startup and authenticated storage
loading. A second run with `64/1` still reached approximately `103 MiB` after the
same route load. This is macOS evidence, not a Railway benchmark, but it shows
that lowering old-space alone does not proportionally lower total RSS and that a
100 MB service target leaves almost no room for real SLOW data or cycle spikes.

## Dev/Backtest Exclusion

The backtest page is useful locally but should not be part of normal Railway production behavior:

```text
/dev/dynamic-trade
/dev/coins
/dev/black-swan
/api/dev/dynamic-trade
/api/dev/dynamic-trade/leaderboards
/api/dev/coins
/api/dev/coin-tags
/api/dev/black-swan
```

These routes are not expected to consume a large amount of idle memory just because they exist in the build. Next.js usually loads route code when the route is requested. However, excluding or guarding them still matters because it:

- Prevents accidental production access to expensive backtest execution.
- Reduces production bundle and standalone trace noise.
- Makes the deployed app easier to reason about.
- Avoids dev UI imports leaking into the `/slow` production client bundle.

## Implemented Controls

Production now uses one shared server-side dev-backtest guard:

```ts
isDevBacktestEnabled()
```

Enabled when:

```text
NODE_ENV !== production
ENABLE_DEV_BACKTEST=1
NEXT_PUBLIC_ENABLE_DEV_BACKTEST=1
```

Implemented behavior:

- `/dev/dynamic-trade` is force-dynamic and returns `notFound()` in production unless dev backtest is enabled.
- `/dev/coins` returns `notFound()` in production unless dev backtest is enabled.
- `/dev/black-swan` returns `notFound()` in production unless dev backtest is enabled.
- `/api/dev/dynamic-trade` is a tiny route stub that returns `404` in production unless dev backtest is enabled.
- `/api/dev/dynamic-trade/leaderboards` is a tiny route stub that returns `404` in production unless dev backtest is enabled.
- `/api/dev/coins` and `/api/dev/coin-tags` return `404` in production unless dev backtest is enabled.
- `/api/dev/black-swan` returns `404` in production unless dev backtest is enabled.
- Heavy dev API implementations live outside `src/pages/api` under `src/lib/devBacktest/api`.
- Heavy dev API implementations are dynamically imported only after the API guard passes.
- The SLOW settings page lazy-loads the dev leaderboard picker.
- The SLOW settings page hides the leaderboard picker in production unless `NEXT_PUBLIC_ENABLE_DEV_BACKTEST=1`.

Next.js will still list the `/api/dev/*` routes during build because route files still exist. That is acceptable: the production-built route files are intentionally small guard shells. The heavy backtest code is not loaded into memory unless the endpoint is explicitly enabled and requested.

## Fixed Dev UI Leak

Before this optimization, the SLOW trading settings statically imported dev leaderboard UI:

```ts
import HistoryBTestConfig from "@/components/dev/DynamicTrade/Leaderboards/HistoryBTestConfig";
```

This means production `/slow` can pull dev/backtest UI code into the production client bundle.

Fixed behavior:

- Hide the leaderboard picker in production unless `NEXT_PUBLIC_ENABLE_DEV_BACKTEST=1`.
- Lazy-load the dev component instead of statically importing it into the SLOW settings bundle.
- Keep the production settings page usable without importing `@/components/dev/*`.

Target behavior:

```text
Railway production:
  /slow settings works
  no dev leaderboard UI is loaded

Local development:
  /slow settings can still pick from leaderboards when dev backtest is enabled
```

## API Guard

Dev APIs should be hard-guarded:

```ts
if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_BACKTEST !== "1") {
  return res.status(404).json({ error: "Not found" });
}
```

Use `404` instead of `403` so production does not advertise that a dev endpoint exists.

The heavy backtest imports should also be moved inside the handler after the guard when practical:

```ts
const { runBacktestVolatilityDynamic } = await import("@/lib/dynamic/backtest-volatility");
```

This avoids loading heavy backtest modules in production unless the dev endpoint is intentionally enabled.

## Route Guard

Dev pages should also be unavailable in Railway production unless enabled.

Expected production behavior:

```text
ENABLE_DEV_BACKTEST unset:
  /dev/dynamic-trade -> not found
  /dev/coins -> not found
  /dev/black-swan -> not found
  /api/dev/dynamic-trade -> not found
  /api/dev/coins -> not found
  /api/dev/coin-tags -> not found
  /api/dev/black-swan -> not found

ENABLE_DEV_BACKTEST=1:
  dev pages/APIs are available
```

## Real Memory Wins

These are already implemented or partly implemented and are more likely to
reduce actual Railway runtime memory:

- A multi-account stage prepares one shared immutable public-market snapshot
  and then executes eligible accounts sequentially, instead of rebuilding the
  same volatility, price-normalization, price, funding, and volume inputs for
  every account.
- Speedup and Standard Monitoring select the union of open-position symbols,
  and an empty monitoring pass avoids public and private market I/O.
- Public latest-price, stage-candle, funding-rate, and 24-hour-volume work uses
  bounded freshness or single-flight reuse.
- Runner and withdrawal flows load storage with `modeScope: "active"`, so the
  inactive mode is not hydrated into normal runtime memory.
- Closed production history is persisted in split per-symbol files and is not
  kept in `model_memory.positionsSell` during normal runner loads.
- Signal generation hydrates only the current UTC month's closed history when
  monthly counters need it, instead of loading all durable history.
- Runtime caches such as volatility and `priceNormMapOverTime` are persisted to
  cache files and removed from the saved mode snapshot after cycle completion.
- Latest 24-hour market volume is fetched as one ticker batch and persisted as a
  compact JSON snapshot.
- Live exchange-position reconciliation updates local open-position size/margin
  from `getPositions()` before averaging and exit logic, reducing accounting
  drift without additional per-position storage shapes.
- Dev/backtest routes and APIs are guarded so expensive local-only flows cannot
  be accidentally triggered in Railway production.
- `NODE_OPTIONS` old-space and semi-space caps are available for controlling
  V8 heap growth, but not total service RAM.
- The runtime resource monitor samples every 15 seconds and reads cgroup memory
  on Railway before falling back to process RSS.
- Cycle section timing is persisted for diagnostics, and the quality suite has
  an 80-symbol production-shaped functional cycle test.

Still important operational habits:

- Keep symbol count reasonable for the live runner.
- Avoid calling dashboard/debug endpoints that return very large arrays unless
  the UI needs them.
- Monitor memory after deploys and after increasing symbol count.
- Disable the automatic runner only when manual execution is acceptable:

```bash
DISABLE_SLOW_TRADING_RUNNER=1
```

That flag can save memory and CPU, but it changes behavior because SLOW will no longer run automatically.

## Build Cleanliness Wins

These remain good architecture, but may not visibly reduce idle memory:

- Removing dev routes from production access.
- Excluding `src/__dev__` from standalone traces.
- Avoiding production imports from `@/components/dev/*`.
- Keeping `/api/dev/*` separate from `/api/slow-trading/*`.
- Keeping backtest helpers out of shared production components unless they are type-only imports.
- Running `npm run build:railway` to remove unnecessary runtime files after the
  standalone build.

### Current Build-Trace Regression

The September 4 production build completed, but Turbopack warned that the whole
project was traced unintentionally. The repeated import trace was:

```text
next.config.ts
src/lib/devBacktest/volatility-dataset/index.ts
src/lib/dynamic/backtest-volatility/index.ts
src/lib/slowTrading/quick-backtest.ts
src/lib/slowTrading/index.ts
production API route
```

Sampled production route NFT manifests each contained `1,290` files, and the
generated standalone directory was about `106 MB`. `src/instrumentation.ts`
imports the grouped `@/lib/slowTrading` facade during server startup, while that
facade statically imports `quick-backtest.ts`. This defeats the intended runtime
boundary between production orchestration and backtest code.

Artifact size is not the same as RAM, so this trace does not by itself explain
all `151-232 MB`. It is still the first code boundary to fix because it is
confirmed by the build, is loaded from the startup path, and makes clean memory
attribution harder.

Required direction:

```text
Production instrumentation imports only the runner/runtime entry point.
Production APIs import focused SLOW modules where one capability is needed.
Quick Backtest dynamically imports its implementation only after its route is
authenticated and invoked.
Normal production route traces do not include devBacktest datasets or
dynamic backtest implementations.
```

Do not remove Quick Backtest behavior. Isolate its load boundary.

### Cache-Retention Risk

`src/lib/slowTrading/public-market-cache.ts` removes an expired completed value
only when the exact same key is requested again. It does not sweep expired keys,
bound the map, or expose cache size in runtime diagnostics. Keys include symbol
sets and configuration values, so configuration or account/symbol changes can
leave expired shared snapshots reachable for the life of the process.

This is a confirmed retention behavior, but its contribution to the Railway
graph has not yet been measured. Add bounded eviction or expired-entry sweeping
and a cache-entry-count diagnostic before calling it the cause of the 232 MB
service.

## Client-Only Dashboard Pages

Heavy dashboard pages should render as client-only UI:

```ts
const LiveDashboardPage = dynamic(() => import("./LiveDashboardPage"), {
  ssr: false,
  loading: () => <p>Loading SLOW dashboard...</p>,
});
```

Important App Router rule:

```text
Do not put dynamic(..., { ssr: false }) directly inside a Server Component page.
```

Next.js only supports `ssr: false` for Client Components. The route page can stay a Server Component for metadata and guards, but the `next/dynamic` call must live inside a `"use client"` wrapper component.

Current pattern:

```text
src/app/slow/page.tsx
  Server Component route shell and metadata
  imports "@/components/LiveDashboard"

src/components/LiveDashboard/index.tsx
  "use client"
  uses next/dynamic(..., { ssr: false })
  lazy-loads LiveDashboardPage
```

This reduces server-side rendering work for dashboard UI requests. It does not stop the SLOW runner, because the runner is server-side system logic and does not depend on whether the dashboard UI is open.

## Verification Checklist

After optimization changes:

```bash
npm run type
npm run build
npm run quality
```

The build must finish without the whole-project NFT trace warning. Sample
production routes must not trace `next.config.ts`, `src/lib/devBacktest/**`, or
the dynamic backtest implementation.

Then verify the build route list:

```text
/slow exists
/api/slow-trading/* exists
/dev/dynamic-trade is unavailable or guarded in production
/dev/coins is unavailable or guarded in production
/dev/black-swan is unavailable or guarded in production
/api/dev/dynamic-trade is unavailable or guarded in production
/api/dev/coins is unavailable or guarded in production
/api/dev/coin-tags is unavailable or guarded in production
/api/dev/black-swan is unavailable or guarded in production
```

On Railway, watch:

- Memory should settle after startup.
- CPU should stay low between runner cycles.
- No repeated SIGTERM/restart loop.
- `/slow` loads normally.
- Storage still persists under `/storage`.

Local memory comparison flow:

```bash
npm run build
npm run start:local
npm run monitor:local
```

Repeat with representative symbol counts such as 9, 15, 50, and the actual
production count. Use the actual production account count. Record all of these
states separately:

```text
fresh startup before dashboard access
after /slow and dashboard API loading
peak during every scheduled stage
five minutes after cycle completion
after 6 hours
after 24 hours
```

For every sample capture:

```text
cgroup used MB and limit MB
process RSS MB
heapUsed MB and heapTotal MB
external and arrayBuffers MB
public-market cache entry count
configured/enabled/eligible account counts
symbol count and open-position count
stage and cycle profiler summary
```

Compare `Multi Grail` and `Holy Grail` using the same commit and Node version.
The current `81 MB` difference is useful evidence only after differences in
account count, symbols, open positions, persistent file sizes, dashboard
traffic, and environment flags are recorded.

## Prioritized Work To Reach 100 MB

### P0: Measure the Correct Memory Components

- Include `heapUsed`, `heapTotal`, `rss`, `external`, `arrayBuffers`, cgroup
  usage, and cgroup limit in memory-monitor diagnostics.
- Save time-series samples by stage instead of relying on one Railway tooltip.
- Verify each service has exactly one replica; Railway aggregates replica memory
  for a service.
- Record the deployed Node version and the exact `NODE_OPTIONS` from each
  service.

### P0: Remove Backtest Code From Production Startup

- Stop importing the complete SLOW facade from instrumentation.
- Lazy-load Quick Backtest at its API boundary.
- Make the whole-project NFT trace warning a build failure or budget check.
- Rebuild and compare startup RSS before changing heap limits again.

### P1: Bound Process-Lifetime Caches

- Sweep expired completed public-market cache entries.
- Add a maximum entry/byte policy for configuration-dependent keys.
- Expose entry counts and estimated payload size in diagnostics.
- Confirm Black Swan, funding, exchange-info, PIN-attempt, and request-weight
  caches remain bounded by stable keys.

### P1: Measure Real Data And File-Cache Effects

- Compare persistent `memory.json`, price-normalization, volatility, history,
  and dashboard payload sizes between the two Railway services.
- Record memory before and after each large JSON read.
- Keep runtime endpoints on active-mode, no-history loads unless history is
  explicitly required.
- Split `/api/slow-trading/storage` if dashboard history causes a measurable
  retained or peak-memory increase.

### P2: Enforce Budgets

- Add a standalone startup-RSS budget and a representative-cycle peak budget in
  an environment close to Railway Linux.
- Add route-trace and standalone artifact-size budgets.
- Keep the existing 80-symbol cycle test, but do not call it a memory test; it
  verifies behavior and persistence, not RSS.

## Remaining Optimization Risks

- There is no automated RSS/cgroup regression test for a full production SLOW
  cycle. The 80-symbol test does not measure memory.
- There is no route-trace, standalone-size, server-chunk, or client-bundle budget
  in the normal quality workflow.
- Production memory notifications omit the component breakdown needed to
  distinguish JavaScript heap from process/container overhead.
- The process-lifetime public-market cache has no global expiry sweep or size
  bound.
- The dashboard storage endpoint can hydrate/report combined multi-account
  state and may become a payload and peak-memory hotspot as history grows.
- Exchange integration tests remain limited for Binance futures position
  reconciliation.

## Decision

Excluding dev/backtest from production is the right architecture.

Expected impact:

```text
Production safety: high
Bundle cleanliness: medium/high
Idle memory reduction: low/medium
Runtime spike reduction: medium/high if dev APIs cannot be called
```

Current status:

```text
Production safety: good
Multi-account public-market reuse: good
Runtime memory target: failed (151-232 MB observed vs <=100 MB target)
Memory attribution: insufficient
Production build boundary: needs improvement
Optimization confidence score: 68/100
```

The next meaningful improvement is to separate production startup from Quick
Backtest/dev imports, then capture cgroup, RSS, and heap components through real
stages. Only after that comparison should the 100 MB target be accepted as
achievable for this single-process Next.js dashboard-and-runner architecture.

## References

- Node.js CLI documentation for `--max-old-space-size` and
  `--max-semi-space-size`: <https://nodejs.org/api/cli.html>
- Node.js process memory definitions: <https://nodejs.org/api/process.html#processmemoryusage>
- Railway metrics and replica aggregation: <https://docs.railway.com/observability/metrics>
