# v19

- Introduce the v19 it will try to do the best timing

Choose the best coin to entry based on the Speed tags:

```
Speed Tier 1:
Maximal (hours): avg hold = 24 (less than 1 days)
Maximal (hours): max hold = 96 (less than 4 days)
vpoint transition less than = 30 hour (1 day+6 hour)

Speed Tier 2:
Maximal (hours): avg hold = 48 (less than 2 days)
Maximal (hours): max hold = 168 (less than 1 week)
vpoint transition less than = 30 hour (1 day+6 hour)

Speed Tier 3:
Maximal (hours): avg hold = 72 (less than 3 days)
Maximal (hours): max hold = 336 (less than 2 week)
vpoint transition less than = 48 hour (2days)
```

**Example**

For example we we have 10 coins the then do filtering based on the vPoint.level >=2

then let say we have 3 coins:

Coin A:

- level 2
- Speed Tier 2

Coin B:

- level 3
- Speed Tier 3

Coin C:

- level 2
- Speed Tier 1

normaly we choose the highest level, so Coin B is choosen because it has level 3. its on the v18 and before.

in the v19 we implement Time Estimation.

let say current time is 1 July 13:00

Coin A:

With Speed Tier 2 it will estimate the avg hold is 48 hours, so it will be exit on 3 July

Coin B:

With Speed Tier 3 it will estimate the avg hold is 72 hours, so it will be exit on 4 July

Coin C:

With Speed Tier 1 it will estimate the avg hold is 24 hours, so it will be exit on 2 July

The default hard entry gate is absolute level 2 or more. It is configurable
with `config.minActionableAbsoluteLevel` in the Entry settings:

- Default is `2`.
- The minimum accepted configured value is `1`.
- When configured as `1`, immediate entry requires `abs(level) >= 1`; level
  zero remains non-actionable and there is no non-zero projection-only level.
- When configured as `2`, immediate entry requires `abs(level) >= 2`, and
  absolute level `1` becomes the wait/projection candidate.
- Production and backtest must use the same configured value.

TC: `BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG`

The dynamic-backtest browser request must forward every runtime setting shown
by the backtest configuration UI. This includes the model and Safe Haven
settings; trading and margin modes; watch reserve and averaging settings;
adaptive averaging and its rescue guard; entry-volume, percentage, fixed, and
position-count limits; the sideways-worker exit policy; the minimum actionable
level; and maximum/exact leverage. Missing transport fields must not silently
fall back to engine defaults after the user configured them in the UI.

The outer request must continue to carry the selected symbols, date range or
custom dates, decision engine, trading algorithm, and both freshness controls.
Name and description are history metadata rather than trading inputs.
`Use StopLoss+` remains the explicit exception because it is labeled live-only
and is intentionally ignored by the volatility-point backtest.

TC: `BTEST:BACKTEST_ENTRY_CONFIG_FORWARDING`

so we need to think. when the coin A and coin C will goto level 3 or more.

we can fetch the latest kline.

for example in this case lavel 3 is positive right so the posible entry is short.

does coin A.price will to the direction up again (by fetch latest kline)? i mean when up again 5% so it will reach level 3.

so now we got pctLikelynessToNextLevel and when.

let say coin A will reach level 3 on 1 July 15:00, and but coin C direction is down so it will not reach level 3, so we can ignore coin C.

ok now the candidates is only coin A, and coin B. so we need to choose which one are faster to exit.

so the coin A level 3 on 1 july 15:00 + Speed Tier 2 avg hold 48 hours (2days) = exit on 3 July

the coin B level 3 on 1 july 13:00 + Speed Tier 3 avg hold 72 hours (3days) = exit on 4 July

we prefer to choose waiting for coin A reach the level 3 because it will exit faster than coin B.

TC steps:

- `PROD:DECISION_V19_SPEED_TIER`: read the coin Speed Tier from persisted coin
  metadata tags. Missing Speed Tier should fall back conservatively.
- `PROD:DECISION_V19_LEVEL_GATE`: only consider immediate candidates with
  `abs(level) >= config.minActionableAbsoluteLevel`, plus projection
  candidates exactly one absolute level below it when that level is non-zero.
  The default immediate-entry level is `2`, and the minimum configurable level
  is `1`.
- `PROD:DECISION_V19_LATEST_KLINE`: for candidates exactly one level below the
  configured entry level, fetch the latest kline/current price so we can see
  whether price is still moving toward the actionable level.
- `PROD:DECISION_V19_DIRECTION_CHECK`: positive level means possible SHORT and
  price must keep moving up; negative level means possible LONG and price must
  keep moving down.
- `PROD:DECISION_V19_LEVEL_PROJECTION`: estimate
  `pctLikelynessToNextLevel` and when the projected coin can reach the
  configured entry level.
  Ignore the coin when the direction is wrong or the projected transition is
  slower than its Speed Tier allows.
- `PROD:DECISION_V19_EXIT_ESTIMATION`: estimate exit time as
  `estimated actionable-level entry time + Speed Tier avg hold`.
- `PROD:DECISION_V19_WAIT_OR_ENTER`: compare projected candidates with current
  immediately actionable candidates. Wait when the projected candidate should
  exit faster; otherwise enter the fastest current actionable candidate.
- `PROD:DECISION_V19_ENTRY_SIZING`: after the timing decision, keep the existing
  investment sizing and execution semantics.

# v20

Decision v20 is the direct level-entry engine intended for scalping. It does
not use Speed Tier metadata, latest-kline projection, projected entry timing,
or estimated exit timing.

For every symbol except BTC, v20 should return the latest volatility point when
the point is unused and:

`abs(level) >= config.minActionableAbsoluteLevel`

The configured minimum uses the same default `2` and minimum `1` normalization
as v19. Every qualifying candidate is returned in the current cycle; v20 does
not wait for a lower-level projection and does not select only one candidate by
estimated exit speed. Existing worker-capacity, position, funding, reserve,
market-mode, and execution guards still run after the engine recommendation.
Existing recommendation sizing and leverage semantics remain unchanged.

TC: `BOTH:DECISION_V20_LEVEL_GATE`
