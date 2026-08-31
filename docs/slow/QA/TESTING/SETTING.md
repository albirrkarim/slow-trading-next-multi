# SLOW Setting Behavior Tests

The settings page should not only save values. Each setting must have a behavior
test proving that the current runtime code uses the setting correctly.

The main test target should be:

`src/__dev__/main/quality/ui/settings-behavior/*.test.ts`

Use this folder for settings that change the production cycle, runner, storage,
or runtime orchestration. The `src/__dev__/main/quality/specs` folder is reserved
for test cases that directly trace `docs/slow/SPECS/_SPECS.md`. Setting-specific tests
belong under `src/__dev__/main/quality/ui` because they protect the dashboard
settings surface, even when the assertion is about runtime behavior.

The first safety net should answer:

> When this setting has value X, does the SLOW code call or skip the correct
> runtime behavior?

## Test Style

Each setting test should follow this shape:

1. Build a minimal SLOW storage fixture.
2. Set the setting under test to the value being verified.
3. Mock the expensive/external dependencies such as exchange calls, volatility
   assignment, entry execution, exit execution, or notification delivery.
4. Run the smallest public runtime path that owns the behavior.
5. Assert the expected function was called, skipped, or called with the expected
   payload.

Avoid testing implementation details that do not matter to the setting. The
assertion should focus on the contract the setting promises.

## Core Cases

### Runtime

- `runnerEnabled = false`
  - `runSlowTradingCycle()` should skip the cycle unless `ignoreRunnerEnabled`
    is passed.

- `runnerEnabled = true`
  - `runSlowTradingCycle()` should continue into the normal cycle path.

- `autoEntryEnabled = false`
  - the cycle should not build entry signals unless forced entry symbols are
    passed.

- `autoEntryEnabled = true`
  - the cycle should build signals and allow entry evaluation.

- `autoEntryDailyPnlLimitUSDT = -50`
  - current UTC-day navbar USD PnL above `-50` should allow automatic entry;
  - current UTC-day navbar USD PnL at or below `-50` should block fresh
    automatic entry while preserving exits and forced manual entry;
  - winning and losing closed trades should be netted rather than counting only
    accumulated losses.

- `autoExitEnabled = false`
  - the cycle should not run normal exit execution unless a position is forced
    to sell.

- `autoExitEnabled = true`
  - the cycle should run exit evaluation for open positions.

- `entrySignalBypass = true`
  - signal generation should receive bypass mode and produce bypass-limited
    recommendations.

### Coin Management

- The `Auto Remove` heading help icon should explain when removal runs, that
  removal does not interrupt existing positions, and that `0` disables a rule.
- `Based on Price (USDT)` should use a number input that permits fractional
  values.
- `Based on Market Cap (USD)` should use a non-negative number input.

- `autoRemoveSymbolAbsLevel = 0`
  - the cycle should not remove configured symbols.

- `autoRemoveSymbolAbsLevel = 6`
  - when a configured symbol has latest vPoint `lvl = 6` or `lvl = -6`, the
    cycle should call storage update with that symbol removed.

- `autoRemoveSymbolAbsLevel = 6` with an open position
  - the cycle should remove the symbol from config while retaining the position
    for monitoring, averaging, and exit.

- `autoRemoveSymbolMinPrice = 0`
  - price-based removal and its entry guard should be disabled.

- `autoRemoveSymbolMinPrice = 0.01` with latest valid price `0.009`
  - live and sandbox should block the new entry, including forced entry.
  - live and sandbox should remove the symbol from config regardless of an open
    position in either mode.

- `autoRemoveSymbolMinPrice = 0.01` with latest valid price `0.01`
  - the symbol remains eligible because only a strictly lower price is blocked.

- `autoRemoveSymbolMinPrice = 0.01` with unavailable or invalid price
  - the price rule should not remove the symbol based on missing evidence.

- `autoRemoveSymbolMinPrice = 0.01` with an open position
  - the cycle should remove the symbol, and the position remains managed.

- `autoRemoveSymbolMinMarketCapUSD = 0`
  - market-cap removal should be disabled.

- `autoRemoveSymbolMinMarketCapUSD = 100000000` with a known market cap of
`99999999`
  - live and sandbox should remove the symbol regardless of whether either mode
    has an open position.

- `autoRemoveSymbolMinMarketCapUSD = 100000000` with an equal, missing,
  invalid, or failed market-cap value
  - the cycle should not remove the symbol.

- Successful market-cap values should be fetched again only after their
  24-hour per-symbol cache expires.
- The Latest Volatility Points table should show the cached market-cap update
  time directly below every market-cap value.
- In Futures mode, the Latest Volatility Points table should show a sortable
  `Funding rate` column directly after `Market cap`, including the payer and
  Binance snapshot update time. Missing values should show `—`.

### Main Trading Config

- `tradingMode = spot`
  - normal automatic entry signals should be filtered to bottom signals only.

- `tradingMode = futures`
  - top and bottom entry signals may remain eligible.

### Entry

- `maxEntryMarginPct > 0`
  - entry sizing should cap the entry plus reserve budget by spendable balance
    percentage.

- `maxEntryMargin > 0`
  - entry sizing should cap the entry margin by fixed USDT.

- `minActionableAbsoluteLevel >= 3`
  - decision.v19 should enter immediately only at or above this absolute vPoint
    level. The level immediately below it remains a wait/projection candidate.
  - decision.v20 should return every unused latest vPoint at or above this
    absolute level without Speed timing or projection.

- `maxLeverage > 0`
  - futures entry execution should not exceed the configured leverage cap.

- `exactLeverage > 0`
  - futures entry execution should use this exact integer leverage, overriding
    the engine calculation and maximum-leverage caps.

### Averaging

- `enableWatchLogic = false`
  - the cycle should not call watch reserve averaging recommendation or
    averaging execution.

- `enableWatchLogic = true`
  - the cycle should call watch reserve averaging recommendation for active
    positions.

- `adaptiveAveraging.enabled = false`
  - averaging should use the normal reserve multiplier behavior.

- `adaptiveAveraging.enabled = true`
  - averaging may raise the multiplier only when the adaptive conditions pass.

- `adaptiveAveraging.maxMultiplier`
  - adaptive averaging should not search above the configured multiplier.

- `adaptiveAveraging.minProjectedProfitPct`
  - adaptive averaging should require this projected profit at the rescue
    target.

- `watchReserveLevels`
  - reserve planning should create only the configured number of next reserve
    steps.

- `watchMaxNextAveragingLevels`
  - averaging recommendations should not exceed the configured relative level
    cap.

- `watchReservePctAlloc`
  - reserve amount calculation should use the configured multiplier.

### Notification

- `NOTIF_DAILY_PNL_LIMIT`
  - should be enabled by default and sent once per channel when the current
    UTC-day navbar USD PnL crosses into the configured auto-entry stop;
  - should reset after recovery above the threshold and on the next UTC day.

- `notification.<channel>.types[].params.level`
  - High Volatility should trigger independently per enabled channel when
    `abs(level)` is equal to or above that channel's value, defaulting to `3`,
    and reset after the level falls below it.

- `notification.<channel>.types[].params.hour`
  - Stale Position should trigger independently per enabled channel strictly
    after this many hours from the first post-entry target vPoint, defaulting
    to `1`.
  - Long Open Position should trigger independently per enabled channel
    strictly after this many hours from position entry, defaulting to `24`.

- `notification.<channel>.types[].params.add`
  - Management Action should notify that channel when a symbol is added only
    when this value is `true`.

- `notification.<channel>.types[].params.remove`
  - Management Action should notify that channel when a symbol is removed only
    when this value is `true`.

- Every Management Action delivery should include its symbol, action, source,
  reason, and timestamp.

### Safe Haven

- `runtime.safeHaven.autoEnabled`
  - enabled schedules should be checked by the active runner;
  - disabled automatic scheduling should not create new queue items.

- `runtime.safeHaven.schedules[]`
  - every enabled schedule should create at most one queue item per mode and
    UTC month on or after its configured `dayOfMonth`;
  - multiple schedules should be able to create multiple items in one month;
  - `amountUSDT` should take priority when positive;
  - `pct` uses the 0–100 scale and should apply when fixed USDT is zero;
  - dates 29–31 should clamp to the month's final date;
  - old `safeUSDTPerMonth` / `safePercentPerMonth` settings should migrate to a
    day-1 schedule, converting an old `0.1` fraction to `10` percent.

- `minimalAssetOnTrade`
  - safe-haven movement should not reduce trading capital below the configured
    minimum.

### Exit

- `exitSidewaysToFreeWorkersForStrongCandidates = false`
  - the cycle should not apply the sideways-exit-for-strong-candidates rule.

- `exitSidewaysToFreeWorkersForStrongCandidates = true`
  - the cycle should call the sideways exit rule, and the rule should be able to
    mark a sideways position for normal exit when a strong candidate qualifies.

- `takeProfitPercent`
  - exit execution should close profitable positions at the configured target.

- `stopLossPercent = 0`
  - stop-loss behavior should be disabled.

- `stopLossPercent > 0`
  - exit execution should close losing positions at the configured stop.

- `useStopLossPlus = false`
  - trailing profit-lock behavior should be skipped.

- `useStopLossPlus = true`
  - trailing profit-lock behavior should be evaluated after activation.

## UI Save Tests

After behavior tests exist, add smaller UI save tests under:

`src/__dev__/main/quality/ui/settings-dialog.test.tsx`

Those tests should only prove that visible inputs are saved into the correct
payload fields. They should not replace behavior tests.

Good UI assertions:

- Changing Coin Management `Based on Abs Level` sends
  `autoRemoveSymbolAbsLevel`.
- Changing Coin Management `Based on Price (USDT)` sends
  `autoRemoveSymbolMinPrice`.
- Changing Coin Management `Based on Market Cap (USD)` sends
  `autoRemoveSymbolMinMarketCapUSD`.
- Changing `Take Profit %` sends `config.modelConfig.takeProfitPercent`.
- Changing `Enable Watch Logic Algorithm` sends `config.enableWatchLogic`.
- Changing `Exchange Account` sends `exchangeAccountId`.

## Rule

When adding a new setting, add at least one behavior test for the runtime path
that consumes it. If the setting is shown in the UI, add a UI save test only
when the field has unusual mapping or has broken before.
