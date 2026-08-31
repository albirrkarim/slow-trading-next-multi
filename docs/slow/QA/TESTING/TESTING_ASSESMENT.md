# Testing Guide and Assessment

## Overall Score: 82/100

This score means the system is well tested for documented strategy behavior,
calculations, storage, sandbox execution, and many production orchestration
paths. It does not mean the system is fully hardened for every real-exchange or
browser workflow.

The score is based on the value and breadth of the failures the suite can
detect. It is not based on test count alone.

| Area | Score | Assessment |
| --- | ---: | --- |
| Strategy and business rules | 23/25 | Strong entry, exit, averaging, reserve, decision, notification, withdrawal, and Black Swan coverage. |
| Live/backtest parity and runtime orchestration | 17/20 | Both paths and stage gates are widely tested, but a complete live-style system path is still missing. |
| Persistence, accounting, and migrations | 14/15 | Strong storage source-of-truth, compact-shape, migration, balance, and position-accounting protection. |
| APIs and exchange adapters | 9/15 | API boundaries and exchange failures have useful unit coverage, but integration coverage is limited and Binance integration tests are absent. |
| End-to-end and dashboard workflows | 8/10 | Persisted sandbox cycles and broad jsdom UI behavior are covered; critical real-browser workflows are not. |
| Reliability and performance | 7/10 | Deterministic tests and cycle profiling exist, but permissive timeouts and serial execution can hide slow or hanging tests. |
| Test governance and maintainability | 4/5 | TC markers, specification mapping, and test-selection rules are strong; coverage measurement is still absent. |
| **Total** | **82/100** | **Strong coverage with important production-boundary gaps.** |

## Overall Status

The project has a strong automated test suite, especially around core SLOW
trading behavior. It is well protected against regressions in entry, exit,
balance, reserve, volatility, storage, notification, withdrawal, profiler, and
persisted sandbox-cycle logic. It also has broad React component rendering and
interaction coverage for dashboard UI. The remaining gaps are critical
browser-driven dashboard workflows, exchange integration breadth, and real live
exchange workflows.

Assessment date: August 11, 2026.

## Current Test Suite

- 47 unit-test files.
- 16 SLOW specification test files.
- 1 SLOW end-to-end cycle test file.
- 1 SLOW performance/profiler test file.
- 43 React UI and settings-behavior test files.
- 3 exchange integration test files.
- 549 quality tests passing across 108 files at the time of this assessment.
- Most Vitest tests run in a Node environment. React UI tests can opt into
  jsdom per file.
- The `quality` command runs linting, TypeScript checks, and quality tests.

## Test Selection Rules

Add or update tests when a change affects:

- Documented SLOW strategy or runtime behavior.
- Business logic, calculations, or conditional flows.
- Persistent storage compatibility or migration behavior.
- API or exchange-adapter contracts.
- Security, privacy, or destructive operations.
- A known regression that should not return.

Do not add a dedicated test for a trivial static or cosmetic edit, such as
moving a fixed sidebar item, changing copy, or reordering non-functional
markup, unless the exact behavior is a documented requirement or known
regression. Do not change production code solely to make an unnecessary test
possible.

A small test is not automatically unimportant. A short test can protect a
critical calculation, storage boundary, exchange failure, or safety invariant.
Judge a test by the failure it can detect, not by its line count.

When a new test is not warranted, still run the existing quality gate. For
documented SLOW behavior, follow the required relationship:

```text
_SPECS.md -> TC -> codebase TC marker -> test file
```

## Strengths

- Important trading rules are tested instead of relying only on generic code
  coverage.
- `docs/slow/SPECS/_SPECS.md` defines named behaviors that can be connected to tests
  with markers such as `BOTH:`, `BTEST:`, and `PROD:`.
- Core areas have focused tests, including:
  - Entry and position-allocation behavior.
  - Exit, take-profit, stop-loss, and rescue behavior.
  - Balance, reserve, and safe-haven calculations.
  - Watch and adaptive-averaging behavior.
  - Volatility-point syncing and throttling.
  - Live open-position reconciliation from exchange position data.
  - Storage source-of-truth behavior.
  - Notifications and withdrawals.
  - Persistent error, Safe Haven, and withdrawal logs.
  - Cycle profiler section-duration output.
  - Navbar balance privacy rendering, user interaction, and localStorage
    persistence.
  - One persisted sandbox cycle from storage through fake-exchange execution,
    persistence, and dashboard output.
  - One larger 80-symbol persisted sandbox cycle through fake-exchange
    execution and dashboard output.
- Most tests are deterministic and use mocked external dependencies, making
  the quality suite fast enough to run regularly.
- Type checking is part of the main quality gate. The production build is a
  separate command.

## Weaknesses and Risks

### No coverage measurement

The project does not collect code coverage or enforce minimum coverage
thresholds. Passing tests confirm the tested examples, but there is no reliable
measurement of how much production code remains untested.

### UI Test Scope

The suite now has broad jsdom-based React rendering and interaction coverage.
This protects important settings payloads, privacy behavior, error handling,
and user actions. However, jsdom does not replace browser-driven testing for
critical multi-step workflows. The suite should avoid growing through tests
that only freeze static labels, styling, or arbitrary component order.

### Limited Live End-to-End Testing

There are deterministic end-to-end SLOW cycle tests using temporary storage and
a fake exchange, including a one-symbol execution path and an 80-symbol
production-shaped config. They exercise persisted storage, market data, manual
signal generation, sandbox execution, persistence, balance snapshots, and
dashboard output. The remaining gap is live-style end-to-end coverage:
browser-driven dashboard workflows and real exchange adapters are still not
tested as one complete flow.

### Exchange integration gaps

Only three exchange integration test files currently exist. Binance does not
have an implemented integration test despite being an important/default
exchange in parts of the application.

### Test configuration can hide performance problems

The global test timeout is two hours, tests run sequentially, and only one
worker is used. This improves isolation but can allow unexpectedly slow or
hanging tests to remain unnoticed for too long.

## Recommended Improvements

1. Enable Vitest coverage and establish realistic thresholds for critical
   trading libraries first.
2. Add Binance SPOT and FUTURES adapter integration tests.
3. Add browser-driven tests only for critical dashboard and configuration
   workflows that jsdom cannot validate reliably.
4. Expand end-to-end coverage with dashboard rendering and real
   credential-aware exchange workflows.
5. Introduce smaller per-suite timeouts and only use extended timeouts for tests
   that genuinely need them.
6. Run unit and specification tests on every change; run live exchange tests in
   a separate, credential-aware workflow.

## Commands

Run the main quality gate:

```bash
npm run quality
```

Run all quality tests, including unit, specification, UI, end-to-end, and
performance tests:

```bash
npm run test:quality
```

Run exchange integration tests:

```bash
npm run test:integration:exchange
```

Run TypeScript validation:

```bash
npm run type
```

Run the production build:

```bash
npm run build
```

## Local CPU/RAM Monitoring

Use the local monitor before Railway deploys to compare memory and CPU across
different SLOW symbol counts.

For the closest Railway-like process, build and run the standalone server:

```bash
npm run build
npm run start:local
```

In another terminal, watch the server listening on port `3010`:

```bash
npm run monitor:local
```

Write samples to CSV for comparing runs:

```bash
node scripts/monitor-process.mjs --port 3010 --interval 5 --csv storage/tmp/memory-50-coins.csv
```

Useful comparison flow:

1. Configure 9 coins, start the app, open `/slow`, let one cycle finish, then
   record the idle RSS.
2. Repeat with 15 coins and 50 coins.
3. Compare `rss_mb` and `cpu_percent` in the CSV files.

The monitor sums the target process plus child processes, so it works for both
`next dev` and `.next/standalone/server.js`.

## Conclusion

The project has a strong foundation of behavior-focused tests and meaningful
protection around the trading engine. The current suite provides good
confidence in core trading calculations, persisted sandbox execution, an
80-symbol production-shaped cycle, profiler output, and broad dashboard
component behavior. The absence of coverage metrics, critical browser-driven
workflows, real live-style exchange workflows, and broader exchange integration
keeps it below a fully hardened score.
