# Trading Features

This document defines the required SLOW trading features and behavior.

## B.1 Watch Mechanism (watch.test.ts)

TC: `BOTH:WATCH_MECHANISM`

It watches the active position and try to averaging. when theres new seen volatility point. that cause the negative pnl.

Behavior expected:

- It multiple 2x current active position margin by default.
- By default, it reserves `reserveLevels = 2` upcoming levels.
- Each level requires an allocation of `pctAlloc = 2` (2x) the rolling total margin.

- It has config of:

`Reserve Next Levels` = 2
`Max Next Averaging Level` = 2
`Max Entry Margin` = 0
`Enable Watch Logic` to see the effect of the watch mechanism.

### B.1.1 Adaptive Averaging (watch.test.ts)

TC: `BOTH:ADAPTIVE_AVERAGING`

Adaptive averaging is optional and controlled by
`config.adaptiveAveraging.enabled`.

When it is disabled, averaging uses the normal watch reserve multiplier, for example `watchReservePctAlloc = 2`.

When it is enabled, SLOW should check whether the normal averaging multiplier is enough to make the averaged position profitable after a rescue move. The rescue target is aligned with `BOTH:POST_AVERAGE_RESCUE_EXIT`:

- The projected target price is `VOLATILITY_THRESHOLD` percent away from the
  current trigger volatility point in the favorable direction.
- For LONG, target price is current volatility point price plus
  `VOLATILITY_THRESHOLD`.
- For SHORT, target price is current volatility point price minus
  `VOLATILITY_THRESHOLD`.
- The projected averaged position profit at that target should be at least
  `config.adaptiveAveraging.minProjectedProfitPct`.
- The default minimum projected profit is
  `floor(VOLATILITY_THRESHOLD / 2)%`. For example, threshold `2` defaults to
  `1%`, while threshold `5` defaults to `2%`.

Behavior expected:

- Start with the normal multiplier, for example `2x`.
- Calculate the new averaged entry price using the latest executable market
  price while keeping the rescue target anchored to the trigger vPoint price.
- If projected profit at the rescue target is below the configured minimum,
  try the next multiplier progressively up to
  `config.adaptiveAveraging.maxMultiplier`. The default maximum is `5x`.
- Increasing the multiplier is allowed only when the account has enough spendable balance beyond already reserved balance.
- If no affordable multiplier reaches the projected profit target, skip
  averaging without consuming the watch step.
- If the trigger vPoint `pct` is strictly greater than
  `1.5 * VOLATILITY_THRESHOLD`, keep the same adaptive multiplier search. If no
  affordable multiplier reaches the projected-profit target, the highest
  affordable candidate from that search may execute instead of being rejected.
  It must still improve the weighted entry and pass the normal balance, reserve,
  level, and target-zone guards.
- Production, sandbox, and backtest must use the same shared calculation.

### B.1.2 Averaging Stops After the Target vPoint

Once an open position has reached its target volatility point after entry,
SLOW must block every later averaging attempt for that position:

- For LONG, the target vPoint is the first `TOP` after entry.
- For SHORT, the target vPoint is the first `BOTTOM` after entry.
- The guard uses the position's post-entry vPoint history.
- A later adverse vPoint must not restart averaging, even if it reaches a deeper
  unused watch level.
- A blocked attempt must not consume or mutate the watch step.
- The guard remains active when the position is not currently profitable.
- Production, sandbox, and backtest must enforce the same guard.

TC: `BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT`

### B.1.3 Averaging Rescue-Projection Guard

Crossing back past the latest vPoint price does not by itself reject averaging.
The current executable price may still improve the position's weighted entry
and provide enough projected profit at the rescue target.

The guard is controlled by `averagingRescueProjectionGuardEnabled` and defaults
to `true`. When it is `false`, failure to improve the weighted entry or satisfy
the rescue-profit projection does not block the normal watch-step margin.
`BOTH:ADAPTIVE_AVERAGING` may still select a larger multiplier when one reaches
the projection target, but if none does, averaging falls back to the normal
watch-step margin. Balance, reserve, level, and target-zone guards still apply.

The guard evaluates the executable price instead:

- Averaging must improve the weighted entry: LONG adds below the current
  position entry price; SHORT adds above it.
- Production and sandbox use the latest fetched market price as the pre-order
  executable price. The exact exchange fill remains the source of truth for
  position accounting after the order.
- Backtest uses the current simulated execution price.
- Use that executable price as the averaging fill price when calculating added
  quantity and the new weighted entry.
- Keep the rescue target anchored to the latest vPoint price, moved in the
  favorable direction by `VOLATILITY_THRESHOLD`.
- Require projected profit at that rescue target to reach
  `config.adaptiveAveraging.minProjectedProfitPct`.
- When `config.adaptiveAveraging.enabled` is `false`, evaluate only the normal
  watch-step margin. Do not increase its multiplier.
- When `config.adaptiveAveraging.enabled` is `true`, start with the normal
  watch-step margin and test progressively larger multipliers against the
  executable price and vPoint-anchored rescue target, up to
  `config.adaptiveAveraging.maxMultiplier`. Use the first affordable multiplier
  that reaches the configured minimum projected profit.
- If no affordable margin satisfies the projection, skip the add without
  consuming the watch step so a later cycle can reconsider it.
- Exception: when the trigger vPoint `pct` is strictly greater than
  `1.5 * VOLATILITY_THRESHOLD`, do not disable `BOTH:ADAPTIVE_AVERAGING`. Run the
  normal adaptive search first. If none of its affordable candidates reaches
  the required projected profit, allow the highest affordable candidate from
  that search instead of letting this projection guard block averaging. With
  adaptive averaging disabled, the normal watch-step margin is the only
  candidate. Equality does not activate the exception. The executable price
  must still improve the weighted entry, and all balance, reserve, level, and
  target-zone guards still apply.
- Production, sandbox, and backtest should use the same calculation.

TC: `BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION`

### B.1.4 Averaging Pauses During an Armed Target-Pivot Confirmation Gap

Status: proposed; not implemented yet.

A target volatility point can be timestamped earlier than the cycle in which it
becomes confirmed. This creates a confirmation race with averaging. For example,
a SHORT position can average while a `BOTTOM` is still forming, then discover a
few minutes later that the confirmed `BOTTOM` has a pivot time before the
averaging execution. The newly confirmed target zone can then activate the
volatility-target stop loss immediately against the enlarged position.

This is market-confirmation latency, not concurrent cycle execution. The normal
exit-before-average ordering cannot prevent it because the target vPoint is not
yet present when exit and averaging are evaluated.

The guard must be narrow. Merely moving favorably away from the latest adverse
vPoint, crossing back past its price, or beginning a possible target move is
not enough to block averaging.

Planned behavior:

- Before executing an averaging order, inspect only closed market candles that
  are visible at that execution time.
- Pause averaging only when every condition below is true:
  1. The averaging recommendation still refers to the latest confirmed adverse
     vPoint for the position: a `TOP` for SHORT or a `BOTTOM` for LONG.
  2. No opposite target vPoint has been confirmed after the position entry.
  3. Price after that adverse vPoint has already moved the complete configured
     `VOLATILITY_THRESHOLD` in the favorable direction. This arms the same
     directional move from which the opposite target pivot can be produced.
  4. A candidate target extreme exists after the adverse vPoint: a local low
     for SHORT or a local high for LONG.
  5. A later closed candle has reversed away from that candidate extreme in the
     pivot-confirmation direction.
  6. The reversal is still below the volatility detector's confirmation
     percentage. Once it reaches that percentage, the confirmed target-vPoint
     behavior is responsible for blocking averaging.
- For a SHORT position, the narrow gap is therefore: the full downward target
  move has occurred, a candidate `BOTTOM` exists, and price has begun rebounding
  from it but has not yet rebounded enough to confirm the `BOTTOM`.
- For a LONG position, the mirrored gap is: the full upward target move has
  occurred, a candidate `TOP` exists, and price has begun pulling back from it
  but has not yet pulled back enough to confirm the `TOP`.
- Recent closed one-minute candles should be used in production and sandbox so
  this intrabar confirmation gap is visible before the five-minute volatility
  point becomes confirmed. Candle wicks and the still-forming one-minute candle
  must not activate the guard. This guard must not change the confirmed vPoint
  dataset or its timestamping rules.
- Backtest must evaluate the same guard using only candles available at the
  current simulated time. It must not look ahead at a future candle or a future
  confirmed vPoint.
- When the guard blocks averaging, it must not place an order, consume a watch
  step, change `lastHandledLevel`, alter the position exposure, or release any
  reserved averaging margin. A later cycle may evaluate the position again.
- Once the target vPoint is confirmed, the existing
  `BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT`,
  `BOTH:VOLATILITY_TARGET_TP`, and
  `BOTH:VOLATILITY_TARGET_SL_VALUE` behavior remains authoritative.
- A lock around the cycle is not the fix for this case because SLOW already
  serializes cycles; the missing state is the not-yet-confirmed market pivot.

The guard must not block these existing valid cases:

- A normal adverse move toward a deeper averaging level.
- A favorable pullback that has not completed `VOLATILITY_THRESHOLD` from the
  latest adverse vPoint.
- Price crossing back past the latest vPoint while the existing
  `BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION` guard still approves the average.
- A target-direction move that is still extending its candidate extreme and
  has not produced a later closed-candle reversal.
- Any case that fails one or more of the six required conditions above.

FOLKS SHORT regression example:

- Confirmed `TOP L2`: `2.098` at `16:15`.
- Candidate `BOTTOM`: `2.055` at `16:20`, a `2.05%` favorable decline from the
  TOP that completed the configured volatility move.
- Averaging attempt: `2.068` at `16:23`, after a `0.63%` rebound from the
  candidate BOTTOM but before the detector's `1%` confirmation. This attempt
  must be blocked without consuming the watch step.
- Confirmed `BOTTOM L0`: the later price reached `2.077` at `16:27`, a `1.07%`
  rebound from `2.055`, so the existing confirmed target-vPoint behavior takes
  over.

Required tests:

- SHORT: an armed `BOTTOM` candidate with a partial rebound blocks an otherwise
  valid average during the confirmation gap.
- LONG: an armed `TOP` candidate with a partial pullback blocks the mirrored
  averaging case during the confirmation gap.
- Movement below the volatility activation threshold does not block a valid
  average.
- Reaching the activation threshold without a later closed-candle reversal does
  not block a valid average.
- Crossing the latest vPoint price without satisfying all confirmation-gap
  conditions does not block a valid average.
- A blocked attempt leaves the watch step, reserve, execution history, and
  exposure unchanged.
- Production/sandbox and backtest use only their currently visible candle data
  and produce the same decision for equivalent market history.

Planned TC: `BOTH:AVERAGING_PAUSES_DURING_TARGET_CONFIRMATION_GAP`

## B.2 Adjust Entry Amount Based on the Balance and Reserve Mechanism (entry.test.ts)

TC: `BOTH:ADJUST_ENTRY_AMOUNT`

### B.2.1 Step-by-Step Adjustment

Entry sizing must be adjusted in this order:

1. Start with the entry amount requested by the decision algorithm.
   This probability-sized amount is an entry **margin budget** in USDT, not
   futures notional. Entry caps and reserve fitting operate on this margin.
   After the final margin is known, futures leverage derives the order
   notional. Leverage must never divide the requested entry margin.
2. If `config.maxEntryBased24HourVolPct` is greater than `0`, calculate an
   effective sizing budget from the coin's 24h quote volume.
3. Temporarily cap `balance.spendable` for the sizing calculation to the lower
   value of the real spendable balance and the 24h-volume budget.
4. Adjust the entry amount so the entry plus all planned reserve/averaging
   levels fit inside that effective sizing budget.
5. If `config.maxEntryMarginPct` is greater than `0`, adjust again so the entry
   plus reserves fit inside that percentage of the effective sizing budget.
6. If `config.maxEntryMargin` is greater than `0`, adjust again so the entry
   amount itself does not exceed that fixed USDT cap.

The 24h-volume cap is only used during the sizing calculation. It must not
remove, lock, or reserve the extra real spendable balance that sits above the
effective sizing budget.

### B.2.2 Definition

- config.maxEntryMarginPct

value range: 0-100

Limits how much of the effective sizing budget may be used by entry plus
reserve planning.

for example balance.spendable = $100 and config.maxEntryMarginPct = 75%

so the sizing calculation can use at most $75.

- config.maxEntryBased24HourVolPct

Default: `0.2`

Value range: `0` or higher. `0` disables this behavior.

Calculates a liquidity-aware sizing budget from the coin's 24h quote volume.
This is not only a direct entry-notional cap. It caps the temporary spendable
budget used to fit the entry amount plus reserve/averaging requirements.

Formula: 24h volume × 0.2% = estimated max entry.

In config terms:

```txt
volumeBudget = volume24h * (config.maxEntryBased24HourVolPct / 100)
effectiveSizingBudget = min(realBalance.spendable, volumeBudget)
```

Example:

```txt
volume24h = $50,000
config.maxEntryBased24HourVolPct = 0.2
volumeBudget = $50,000 * 0.002 = about $100
```

### B.2.3 Example Condition

actual balance.spendable is $200

but the 24h-volume budget is $100 after calculating
`config.maxEntryBased24HourVolPct`.

Only for the adjustment process, the sizing function must think
`balance.spendable = $100`.

algorithm say to entry amount $50

then it will be adjusted because the entry plus reserve plan must fit inside
the $100 effective sizing budget.

so from $50 will be adjusted into $10 because with the config reserve next level is 2

so it better to entry $10 + reserved is $20 + $60

inside the temporary sizing calculation:

balance.spendable: $10

balance.reserved: $80

balance.locked: $10

but when config.maxEntryMarginPct is set and not 0

let say config.maxEntryMarginPct = 75 %

so from the effective sizing budget of $100

the sizing calculation can use at most $75

so we need to adjust again the entry amount (since from previous step is requiring total $90 (10+20+60) and we only have 75 as real spendable)

the fit is entry 8 + reserved (16 + 48)

total required is 72, so 72 is less than real spendable which is 75.

but when config.maxEntryMargin is set and not 0

let say config.maxEntryMargin = $7

so the entry amount will be adjusted down again because on the step before is more than the config.

so the entry will be $7 + reserved is 14 + 42

total required will be = 63

inside the temporary sizing calculation:

spendable: $37

reserved: $56

locked: $7

Real system balance will be:

spendable: $137 // the extra $100 above the 24h-volume budget stays spendable

reserved: $56

locked: $7

## B.3 Entry Rules (entry.test.ts)

### B.3.1 Maximum Open Positions Entry Guard

TC: `BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD`

`config.maxOpenPositions` limits the total number of simultaneously open
positions. It is an integer greater than or equal to `0` and defaults to `0`.

- `0` disables this guard and preserves the current unlimited behavior.
- A positive value is the maximum number of open positions allowed within the
  active trading mode. Live and sandbox count their own positions separately;
  backtest counts the simulated portfolio.
- Before any automatic or manual new entry, count active positions across all
  symbols in that mode. When the count is greater than or equal to
  `maxOpenPositions`, reject the new entry.
- A rejected entry must not place an exchange order, change balances or
  reserves, create a position, or mark the source volatility point as used.
- Averaging an existing position is not a new position and must not be blocked
  by this guard.
- Production, sandbox, and backtest must enforce the same rule.

### B.3.2 it should only have one active position per symbol.

so if we have 1 active position on BTCUSDT, we cant entry another position on the same symbol until we exit the first one.

TC: `BOTH:ONLY_ONE_ACTIVE_POSITION_PER_COIN`

### B.3.3 It should entry only on unused volatility point.

it entry on vPoint.id = "1ef" then it exit. but the system is entry again because it is still forming the same entry signal, because it does not create the next volatility point yet.

Guard:

- Before entry, check the current volatility point itself.
- If `vPoint.used === true`, the system must not entry from that volatility point again.
- After a successful entry, mark the source volatility point with `vPoint.used = true`.
- Only successful entry can mark it used. Signal preview/building should not consume the volatility point.
- The used flag is persisted through the per-symbol volatility cache JSON, so the next SLOW cycle still knows the point has been consumed.
- Production must not use `item.model_memory.positionsSell` for this guard because `positionsSell` is deprecated for production closed-trade history. It may still exist for legacy/backtest flows only.

TC: `BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID`

### B.3.4 it should not entry when theres no spendable balance. left for current trade signal.

for example we have

balance.available = 85
balance.spendable = 5
balance.reserved = 80
balance.locked = 10

the entry signal $10 so with that balance condition we cant open more position.

the required will be 5 + 10 + 30

entry margin ($5) + reserved for 2 next level ($40)

but the balance.spendable = 5 so it cant.

TC: `BOTH:HAVE_ENOUGH_TO_RESERVED`

### B.3.5 Always have spendable to bailing out

it should consider to have spendable balance for bailing out the current open position.

Study case:

Current situation is entry logic is always trying to empty out the spendable balance by amount of margin entry + reserved.

Theres a case lot entry signal at close time.

with config reserve next levels = 2 and max next averaging levels = 3

so there is 1 level is not reserved right.

so it will looking up to the balance spendable.

unfortunately at the time it has small because we entry much.

so i need to implement some layer confirmation before entry.

is current situation have different between "reserve next levels" and "max next averaging levels"

for example it 1 level.

so the logic is

Check open positions plus the projected new position, then find the single
largest `UNRESERVED` step (an existing position may already have averaged and
therefore require more margin).

Look at this record from the backtest. theres status "UNRESERVED"

```json
{
  "watchState": {
    "entryLevel": -3,
    "lastHandledLevel": -3,
    "reserveBaseMarginUsdt": 99,
    "reservedRemainingUsdt": 792,
    "reserveSteps": [
      {
        "level": -4,
        "marginUsdt": 198,
        "pctAlloc": 2,
        "status": "RESERVED"
      },
      {
        "level": -5,
        "marginUsdt": 594,
        "pctAlloc": 2,
        "status": "RESERVED"
      },
      {
        "level": -6,
        "marginUsdt": 1782,
        "pctAlloc": 2,
        "status": "UNRESERVED"
      }
    ]
  }
}
```

so the "one largest position" unreserved is need 1782

for example current condition is spendable balance 2000.

and theres signal that after doing process of `BOTH:ADJUST_ENTRY_AMOUNT` it need 1000

so even dough we can afford it. but since the "one largest position" unreserved is need 1782

so we need reject the new entry.

so spendable also acts as the balance for bailing out the single largest
`UNRESERVED` step across current positions and the projected new position.

TC: `BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT`

### B.3.6 it should using same leverage calculation between backtest and the production

so it params entrySignal and dynamicTradeConfig.maxLeverage

`config.exactLeverage` defaults to `0`. When it is a positive value, both
backtest and production futures entries must use that exact integer leverage,
overriding the engine calculation, `entrySignal.maxLeverage`, and
`config.maxLeverage`. Spot entries remain at `1x`.

TC: `BOTH:LEVERAGE_CALCULATION`

### B.3.7 it should have guard late entry

theres condition we have two entry signal.

we entry the first, then it take profit. on the same time it entry again on other coin signal.

because our signal is based on the v point.level

but the price already drift into our trade direction.

so distance PCT the entry.price to the next vpoint.price is just a little.

so i need guard before entry.

The maximum profitable drift depends on `VOLATILITY_THRESHOLD`:

- When `VOLATILITY_THRESHOLD < 5`, block drift greater than `0.5%`.
- When `VOLATILITY_THRESHOLD >= 5`, block drift greater than `1%`.

The boundary itself remains allowed. Adverse drift does not trigger this guard.

on the backtest we dont have this. because on the backtest we use pure vpoints. not klines

TC: `PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT`

### B.3.8 Averaging not allowed in low level

Averaging should not run on absolute level `1` or `0`. Entry uses `config.minActionableAbsoluteLevel`; setting it to `1` allows decision.v19
and decision.v20 to enter on absolute level `1`.

TC: `PROD:LOW_LEVEL_NO_ACTION_AVERAGING`

## B.4 Exit (exit.test.ts)

The exit behavior may vary based on user-defined config. The codebase must be able to consume these exit configs:

### B.4.1 Exit on absolute vPoint level

`modelConfig.exitOnVPointAbsLevel` closes an open position when the latest
volatility point for its symbol satisfies
`abs(latestVolatilityPoint.lvl) >= exitOnVPointAbsLevel`.

The default is `0`, which disables this rule. The configured value is treated
as a non-negative whole level. This production/runtime rule applies to both
live and sandbox execution, but not to the volatility-point backtest.

The rule runs before the ordinary PnL-based automatic exits. A triggered close
uses the stop-loss trade category and persists
`closed.reason = "EXIT_ON_VPOINT_LEVEL"`.

TC: `PROD:EXIT_ON_VPOINT_LEVEL`

### B.4.2 Stop loss by net USDT loss

`modelConfig.stopLossUSDT` closes an open position when its fee-adjusted net
USDT PnL is less than or equal to the negative configured amount. For example,
`50` exits when `position.pnl.netUsdt <= -50`.

The default is `50`. Setting it to `0` disables this rule. Production, sandbox,
and volatility-point backtest use the same fee-adjusted boundary. It is an
additional stop loss and does not replace `stopLossPercent`.

The Trading live preview shows the fixed net-USDT loss limit and calculates
its equivalent percentage for every projected entry/averaging notional. A
triggered close uses the stop-loss trade category and persists
`closed.reason = "STOP_LOSS_BY_USDT_LOSS"`.

When one vPoint rail crosses several loss rules at once, the backtest reconstructs
their exact boundary prices and records the smallest loss boundary that would
have been reached first.

TC: `BOTH:STOP_LOSS_BY_USDT_LOSS`

### B.4.3 Traditional TP / SL percent

When SL Plus is disabled, the position should exit using traditional `takeProfitPercent` and `stopLossPercent`.

the stopLossPercent and takeProfitPercent anchor is based on the pure price (unlevered) pnl Percent

On the TP it must be hasHitTargetZone.

TC: `BOTH:TRADITIONAL_TP_SL`

### B.4.4 Volatility target-zone TP

If an open position has already hit the opposite volatility target zone after entry, SLOW should not keep averaging forever. For a LONG position, the target zone is a `TOP` point after entry. For a SHORT position, the target zone is a `BOTTOM` point after entry.

When that target zone exists and the current fee-adjusted gain is still positive, SLOW should close the position as `TAKE_PROFIT` to secure the remaining profit.

The open-position level sequence marks the first target-zone hit as a red `L0`
break and stops showing the unused averaging ladder after that point. It must
still show every subsequently observed vPoint in chronological order through
the latest vPoint, including repeated levels. Intermediate post-target levels
are passed levels and the final vPoint is current. For example:
`L1 -> L2 NOT AVG -> L0 -> L1 -> L0`.

Before a target-zone break, a current non-entry level that has been reached but
has no matching averaging execution is shown with warning color. Once its
averaging execution is recorded, it uses the normal current averaged color.
Open-position monitoring stores its latest market price as `markPrice`. While
the level is reached but not averaged, its chip shows the direction-aware
profit drift from that level's latest vPoint price to `markPrice`, for example
`L4 drift +1.25%`.

For futures positions, the expanded Open Position item shows the persisted
funding rate immediately after Mark Price. Its tooltip explains the crowded
side, whether the current LONG or SHORT position pays or receives, the exchange
snapshot time, and the next scheduled funding time. Positive means LONG pays
SHORT; negative means SHORT pays LONG. Missing data remains visibly
unavailable and does not block position management.

TC: `PROD:OPEN_POSITION_FUNDING_RATE_UI`

TC: `BOTH:VOLATILITY_TARGET_TP`

The level-sequence chip renderer is shared by open positions, closed trade
history, and backtest trade review. In the navbar trade-history table, the PnL
History column shows the closed position's persisted entry, actual averaging
executions in chronological order, and recorded exit vPoint directly below the
PnL history chart. The backtest trade dialog shows the same sequence above its
chart. It also states whether the selected trade was averaged and lists every
persisted averaging execution with its level, actual multiplier, margin, fill
price, optional reservation/projection data, and execution time. The sequence
does not reconstruct unused reserve steps or depend on current volatility data.

TC: `BOTH:REUSABLE_LEVEL_SEQUENCE`

### B.4.5 Volatility target-zone stop loss

After an open position has hit its opposite volatility target zone, SLOW can
apply an additional, tighter stop loss. For a LONG position, the target zone is
a `TOP` point after entry. For a SHORT position, the target zone is a `BOTTOM`
point after entry.

The `volatilityTargetStopLossPercent` configuration is measured from the
position's weighted entry price using fee-adjusted, unlevered PnL. For example,
a value of `2` exits the position when its current net PnL reaches `-2%` or
lower after the target zone has been hit.

The Trading live preview shows this conditional threshold as a distinct chart
line and legend item. Each projected averaging stage also shows the estimated
USDT loss at this threshold and labels that it applies only after the opposite
target zone is hit.

The default value is `0`, which disables this rule. This rule is additional to
the traditional `stopLossPercent`; it does not replace or disable the
traditional hard stop. A triggered exit uses the standard stop-loss category.
Production, sandbox, and backtest must use the same calculation.

TC: `BOTH:VOLATILITY_TARGET_SL_VALUE`

### B.4.6 Post-average rescue exit

After a position has been averaged, System should not rely only on the original traditional TP target.

Averaging changes the entry anchor and the goal becomes rescuing the position with clean approach when price has moved far enough away from the latest volatility point.

Notes:

- For LONG, favorable distance is current price above the latest volatility point price.
- For SHORT, favorable distance is current price below the latest volatility point price.

Conditions:

The favorable price distance from the latest volatility point must be at least
`VOLATILITY_THRESHOLD` in every tier below. A new target vPoint does not need to
be confirmed; the latest available vPoint is the price anchor for this distance
calculation.

The thresholds use the position's current net PnL percentage, the same value
represented by `position.pnl.netPct`. This net percentage already accounts for
trading fees, so the rescue calculation must not subtract entry or estimated
exit fees from it again.

`modelConfig.postAverageRescueExit` configures this rule:

```ts
{
  enabled: true,
  thresholds: [
    { minAveragingCount: 1, minNetPnlPct: 0.5 },
    { minAveragingCount: 2, minNetPnlPct: 0 },
    { minAveragingCount: 3, minNetPnlPct: -0.5 },
  ],
}
```

When `enabled` is `false`, this rule must not request an exit. Other exit rules
continue normally. The default is enabled with the thresholds shown above.

System selects the configured threshold having the greatest
`minAveragingCount` that is less than or equal to the position's number of
completed averaging executions. Therefore, the default row with
`minAveragingCount: 3` applies after 3 or more averaging executions.

The minimum net PnL required for the default configuration becomes less strict
as the number of completed averaging executions increases:

- After exactly 1 averaging execution, request a post-average rescue exit when
  PnL is at least `+0.5%`.
- After exactly 2 averaging executions, request a post-average rescue exit when
  PnL is at least `0%`.
- After 3 or more averaging executions, request a post-average rescue exit when
  PnL is `-0.5%` or better. Do not exit through this rule when PnL is worse than
  `-0.5%`.

The averaging count represents completed averaging executions for the current
position; the original entry is not included in the count.

Dashboard Trading settings and the volatility-point backtest expose the same
enabled switch and threshold rows. Production, sandbox, and backtest must pass
the same configuration to the shared rescue evaluator.

TC: `BOTH:POST_AVERAGE_RESCUE_EXIT`

### B.4.7 Post-average stop loss

`modelConfig.postAverageStopLoss` adds loss protection only after at least one
averaging execution. It is disabled by default and contains ordered threshold
rows:

```ts
{
  enabled: true,
  thresholds: [
    { minAveragingCount: 2, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
  ],
}
```

System selects the row with the greatest `minAveragingCount` less than or equal
to the completed averaging count. The original entry is not an averaging
execution. `maxNetPnlPct` and `maxNetPnlUsdt` are independent fee-aware net PnL
loss boundaries: a value of `0` disables only that boundary, and the position
exits when either active negative boundary is reached.

Production, sandbox, and volatility-point backtest share the same evaluator.
When a vPoint rail crosses this rule and another stop at once, the backtest
back-thinks all crossed loss boundaries and records the smallest loss that
would have occurred first, with `closed.reason = "POST_AVERAGE_STOP_LOSS"`.
The Trading Live Preview shows the selected tier at every averaging stage and a
`FIRST STOP OUTCOME` comparing this rule with the hard-percent and fixed-USDT
stops.

TC: `BOTH:POST_AVERAGE_STOP_LOSS`

### B.4.8 SL Plus

SL Plus exists only in production. When enabled, `takeProfitPercent` is the
activation threshold for trailing profit protection instead of immediate TP.

Dashboard Settings exposes `stopLossPlusTrigger` beneath the StopLoss+ switch.
The dashboard accepts a human percentage value, so `1` means a
one-percentage-point retrace. The exit calculation divides the stored value by
100 before comparing it with the net-gain ratio. The control retains its value
but is disabled while StopLoss+ is off.

Production starts recording peak gain once `takeProfitPercent` is reached.
Once active, `stopLossPlusTrigger` is the allowed retrace from the recorded
peak. The initial minimum exit threshold is `takeProfitPercent -
stopLossPlusTrigger`; for example, TP `2%` with a `1%` retrace initially exits
around `1%`. The threshold rises with every higher recorded peak. Execution
timing and slippage can produce a realized fill below the calculated threshold.

The Trading live preview includes an exit-threshold chart on a signed net-PnL
percent axis. It shows Entry, the combined TP and StopLoss+ activation
threshold, an illustrative peak, the configured retrace exit, and the hard
stop-loss line. It also shows the initial minimum exit line calculated as TP
minus the retrace, plus a distinct path from TP activation down to that initial
minimum. The illustrative peak is TP plus one retrace distance; the actual
StopLoss+ exit follows the live recorded peak.

Below the Trading exit controls, Dashboard Settings shows the production
automatic-exit evaluation order as compact accordions. Every collapsed rule
keeps its `TC:` identifier and current config status visible; expanding it
shows the trigger description so operators can identify which strategy may
cause an exit.

TC: `PROD:SL_PLUS`

### B.4.9 Exit sideways positions to free workers for stronger candidates

When `exitSidewaysToFreeWorkersForStrongCandidates` is enabled, SLOW can
force-exit one sideways open position for a strong entry candidate on the next
cycle.

Rules:

- Applies to production, sandbox, and backtest.
- Sideways means the open position net PnL percent after fees is between
  `-1%` and `+1%`.
- Strong candidate means Speed Tier 1 or Speed Tier 2 with `abs(level) >= 4`,
  for both LONG and SHORT signals.
- The original worker-freeing path only triggers when the Available Workers
  calculation cannot afford the strong candidate.
- In the original worker-freeing path, the current open position must be slower
  than the strong candidate:
  - Speed Tier 3 can be freed for Speed Tier 1 or 2.
  - Speed Tier 2 can be freed for Speed Tier 1.
  - Speed Tier 1 is not freed by this rule.
- Additional aged-sideways path:
  - If a sideways open position has been held for at least `2` days, another
    coin with `abs(level) >= 4` can force-exit it when the candidate Speed Tier
    is better than or equal to the open position's Speed Tier.
  - In production, the candidate must also pass
    `PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT`; a candidate whose current price
    already drifted too far in the profit direction must not force-exit the
    aged sideways position.
  - In backtest, this late-entry drift guard is not available because backtest
    entries use pure vPoints instead of live/current klines.
- The rule only marks the sideways position for exit. It must not mutate or
  clear entry signals; normal entry flow decides what can happen next.
- The setting defaults to `false`.

TC: `BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES`
