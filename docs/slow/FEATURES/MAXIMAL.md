http://localhost:3010/slow

# System Maximal Capacity

The dashboard has a client-side **System Maximal Capacity** section. It helps
estimate how much effective balance the current SLOW configuration needs before
the system starts becoming capital-inefficient.

The calculation uses only the currently loaded/ranged volatility points and the
current dashboard trade config. It does not write storage and does not require a
new start balance input.

## Entry Sequence

An entry sequence starts when a configured coin reaches `abs(level) >= 3`.

The sequence stays active until:

- the coin returns to level `0`, or
- the direction changes defensively.

One active sequence equals one worker slot. Overlapping active sequences are
counted as concurrent workers.

## 24h Volume Cap

Capacity uses the same 24-hour quote volume source shown in Latest Volatility
Points. It does not use each vPoint's local `vq` value because that value is the
volume at that vPoint time, not the current 24-hour quote volume snapshot.

The maximum entry budget starts from:

```txt
volumeBudget = volume24h * (config.maxEntryBased24HourVolPct / 100)
```

Then the normal SLOW entry sizing function is reused, including:

- `config.maxEntryBased24HourVolPct`
- `config.maxEntryMarginPct`
- `config.maxEntryMargin`
- `config.enableWatchLogic`
- `config.watchReserveLevels`
- `config.watchReservePctAlloc`
- `config.maxLeverage`
- `config.tradingMode`

## Output

The section shows:

- **Effective balance**: the maximum concurrent capital needed to support all
  active entry sequences in the current range.
- **Max TP profit**: the configured take-profit potential from the captured
  sequences, shown as USDT and as a percentage of effective balance.
- **Sequences**: how many entry sequences are captured in the current range.
- **Avg workers** and **Max workers**.

It also shows two timeline charts:

- Worker needed over time.
- Effective capital needed over time, with compact `$K`, `$M`, and `$B`
  formatting.

TC: `PROD:SYSTEM_MAXIMAL_CAPACITY`
