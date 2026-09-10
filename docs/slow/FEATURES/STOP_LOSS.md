I need to add new kind of stop loss

stop loss that activated when volatility absolute level reached.

it will have config enabled / disable and multi condition like this:

```
[
[absolute level][pct drift from the last vpoint to adverse direction]
]
```

for example we have config like this

[
level2: pct drift 4%
level3: pct drift 3%
]

the default value of the pct drift is global `VOLATILITY_THRESHOLD`

when the current last vpoint is level abs 2 so use the pct drift 4%

when the current last vpoint is level abs 3 so use the pct drift 3%

This stop loss will be as "OR" with other exit rule / stop loss rule. lets see what reached first

update the live preview, backtest, and quick backtest because we have calculation about the amount loss based on what stop loss will coming first

TC: `BOTH:LEVEL_BASED_PCT_DRIFT_STOP_LOSS`
