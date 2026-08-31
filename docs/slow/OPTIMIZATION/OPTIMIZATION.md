# SLOW Production Optimization

This document tracks how to keep the SLOW Railway deployment clean, efficient, and production-focused.

## Optimization Score: 78/100

Assessment date: June 29, 2026.

The current SLOW production shape is reasonably optimized for a small Railway
deployment. Dev/backtest routes are guarded, the `/slow` dashboard is client
lazy-loaded, runtime storage loads only the active mode, closed trade history is
split out of normal memory, and several runtime caches are persisted outside the
hot storage object. The remaining optimization gap is mostly measurement: there
is no regular memory budget report, no bundle-size budget, and no automated
production-cycle load test that proves the memory cap is safe across larger
symbol counts.

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
NODE_OPTIONS=--max-old-space-size=128 --max-semi-space-size=4
```

This is a conservative production cap. If memory is still stable after normal
runner cycles, dashboard use, and withdrawal scans, a tighter cap can be tested:

```bash
NODE_OPTIONS=--max-old-space-size=96 --max-semi-space-size=2
```

Use the tighter cap only after observing that the app does not restart during
normal runner cycles.

## Dev/Backtest Exclusion

The backtest page is useful locally but should not be part of normal Railway production behavior:

```text
/dev/dynamic-trade
/dev/coins
/api/dev/dynamic-trade
/api/dev/dynamic-trade/leaderboards
/api/dev/coins
/api/dev/coin-tags
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
- `/api/dev/dynamic-trade` is a tiny route stub that returns `404` in production unless dev backtest is enabled.
- `/api/dev/dynamic-trade/leaderboards` is a tiny route stub that returns `404` in production unless dev backtest is enabled.
- `/api/dev/coins` and `/api/dev/coin-tags` return `404` in production unless dev backtest is enabled.
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
  /api/dev/dynamic-trade -> not found
  /api/dev/coins -> not found
  /api/dev/coin-tags -> not found

ENABLE_DEV_BACKTEST=1:
  dev pages/APIs are available
```

## Real Memory Wins

These are already implemented or partly implemented and are more likely to
reduce actual Railway runtime memory:

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
  worst-case memory growth.

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

These are good architecture, but may not visibly reduce idle memory:

- Removing dev routes from production access.
- Excluding `src/__dev__` from standalone traces.
- Avoiding production imports from `@/components/dev/*`.
- Keeping `/api/dev/*` separate from `/api/slow-trading/*`.
- Keeping backtest helpers out of shared production components unless they are type-only imports.
- Running `npm run build:railway` to remove unnecessary runtime files after the
  standalone build.

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
```

For normal code changes, also run:

```bash
npm run quality
```

Then verify the build route list:

```text
/slow exists
/api/slow-trading/* exists
/dev/dynamic-trade is unavailable or guarded in production
/dev/coins is unavailable or guarded in production
/api/dev/dynamic-trade is unavailable or guarded in production
/api/dev/coins is unavailable or guarded in production
/api/dev/coin-tags is unavailable or guarded in production
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

Repeat with representative symbol counts such as 9, 15, and 50 coins. Record
idle memory after startup and memory after at least one runner cycle.

## Remaining Optimization Risks

- There is no automated memory regression test for a full production SLOW cycle.
- There is no bundle-size budget or bundle analyzer report checked into the
  normal quality workflow.
- The dashboard still has limited rendering tests, so UI changes may
  accidentally increase client bundle size without an obvious test failure.
- Exchange integration tests are limited, especially for Binance futures, which
  is important for production-like position reconciliation.
- JSON writes are mostly compact in hot paths, but some cache/history helpers
  still use `fs.writeJSON`; verify generated files stay compact when storage
  size becomes a problem.

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
Runtime memory posture: good for small/medium symbol counts
Measurement discipline: needs improvement
Optimization confidence score: 78/100
```

The next meaningful improvement is not another small route guard. It is adding
repeatable measurement: bundle analysis, memory samples under realistic symbol
counts, and a deterministic production-cycle load test.
