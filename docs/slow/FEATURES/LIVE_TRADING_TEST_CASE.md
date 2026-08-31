# Live Trading Test Case

on page "/trade-history"

Since we have the trade history.

## The problem

The problem is we need to ensure the changes that we made to this system is improving overtime not decreasing.

Think of we make some trading rule or averaging guard or adjusting the trading config or changing the system runtime. to fix some trade case, but accidentally will affect other trade cases.

So better to have a test case to ensure the system is improving overtime.

IT PROVENT BY MATH.

## Page UI

on page "/trade-history" we will have button:

- Make Test case

it will hit some endpoint to create a test case for the current trade history on both live and sandbox folder.

it will be on `storage/persistent/instances/3010/test_cases/live/[COIN].json` folder.
it will be on `storage/persistent/instances/3010/test_cases/sandbox/[COIN].json` folder.

- Run Test case

We just doing replay the test case on both live and sandbox folder.

then lest see if the result is on the end is improving or decreasing. by using the

## Test Case Runner

the test case runner will be exactly same as the live trading runner.

Maybe we can reuse the live trading runner code to run the test case.

It will using same system config.

## Test Case Data

I think we should have test case like

```ts
interface TestCasePosition {
  position: Position;

  /**
   * The klines data for the test case, we will use this to replay the test case.
   */
  klines1m: Kline[];

  /**
   * The klines data for the test case, we will use this to replay the test case.
   */
  klines5m: Kline[];
}
```

## FAQ

1. Where does replay start?

   Should it reconstruct the position immediately after entry, before any averaging, and let the runner reproduce all averaging and exit decisions? This is my recommendation. The final stored `Position` cannot be replayed directly because its exposure already includes averaging.

2. What counts as “improved”?

   Should comparison include:
   - Net PnL
   - Maximum drawdown
   - Margin/capital used
   - Averaging executions
   - Exit reason and time
   - Whether the position remains open

   PnL alone may classify a riskier trade as improved.

3. Which configuration is used?

   Should each case store the configuration from when it was created, or always use the current configuration? I recommend storing the original config as the baseline while optionally running with current config for comparison.

4. How do we reproduce candle visibility?

   This is critical for the FOLKS race. Final `klines1m` and `klines5m` arrays are insufficient because they can expose completed candles before the original runner could see them. We likely need cycle timestamps plus the candle snapshot visible during every cycle, including the then-current incomplete candle.

5. Must replay be completely offline?

   I recommend yes: no exchange requests, real orders, notifications, balance writes, or production-storage mutations. The live logic should run through injected clock, market data, and simulated exchange dependencies.

6. What is the UI scope?

   Is “Make Test case” attached to one trade-history row, or does it capture all displayed trades? Also, `[COIN].json` would overwrite earlier cases. I recommend:

   ```text
   test_cases/sandbox/FOLKS/<entry-vpoint-id>.json
   ```

7. How are intentional behavior changes approved?

   When a new rule deliberately changes a result, should there be an “Accept as new baseline” action while retaining the old result for comparison?

The most important unresolved item is question 4. Without recreating exactly what candle data was visible at each monitoring timestamp, the replay could use future information and would not reliably test this confirmation race.
