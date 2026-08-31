# BOTH DIRECTION TRADING

# Introduction

We are trying to do ping pong trading by betting both directions.

I think we should using binance account that Position Mode = Hedge mode

no need two account.

# A. Scenario

## Scenario 1: High level, entry on level 1

For example we have volatility points like this:

`TOP[1]-A -> TOP[2]-B -> TOP[3]-C -> BOTTOM[0]-D`

Current thought: we should open `SHORT` on level 1, average into level 3, then
exit on level 0.

But we waste the movement from level 1 to level 3. It can be profitable if we
open a `LONG` position at the same time.

One account cannot open both directions (`SHORT` and `LONG`) at the same time.

So we need two accounts. Both accounts can average when price reaches their next
adverse level.

Account 1 for `main direction`

Account 2 for `counter direction`

Both accounts can exit when the target vPoint is reached (`BOTTOM[0]-D`) through
`BOTH:VOLATILITY_TARGET_EXIT`.

for that example

Account 1:

- Open `SHORT` and average, so we can reduce the loss or even make a small
  profit.

- It has all exit logic that we have, not always `BOTH:VOLATILITY_TARGET_EXIT`, depend of what first condition are met.

Account 2:

- Open `LONG` and push profit while the move from level 1 to level 3 continues.
- It can exit through `BOTH:VOLATILITY_TARGET_EXIT` when the last volatility
  point returns to level 0 after traveling through high levels.
- by default Counter direction disables only traditional percentage take-profit and
  `PROD:SL_PLUS`. Stop-loss and structural volatility exits stay enabled as OR
  conditions.
- It might triggered exit when `PROD:REENABLE_TP_LOGIC_AFTER_AT_LEAST_ONE_LEVEL_TO_PROFIT_DIRECTION_PASSED_AND_OTHER_SIDE_WAS_CLOSED` condition happen.

## Scenario 2: Low Level, entry on level 0

`BOTTOM[0]-A -> TOP[1]-B -> BOTTOM[0]-C`

When the minimum actionable level is `0`, we can enter more aggressively.

At the same time, both accounts open positions.

Account 1 opens `LONG` because the level is `BOTTOM`, so the `main direction`
is `LONG`.

Account 2 opens `SHORT` because it is the counter direction.

Account 1 may take profit directly.

Account 2 may average 1 level and may exit by
`BOTH:VOLATILITY_TARGET_EXIT`, `BOTH:VOLATILITY_TARGET_SL_VALUE`,
`BOTH:VOLATILITY_TARGET_TP`, or `BOTH:POST_AVERAGE_RESCUE_EXIT`, depending on
which condition is met first. Normal percentage TP stays disabled for counter
direction.

## Scenario 3: Main doing TP and the counter still open

`BOTTOM[0]-A -> BOTTOM[-1]-B -> TOP[0]-C`

For example like this

Account main open LONG
Account counter open SHORT

Account main may take profit directly but not reaching of forming the volatility point `TOP[1]` with the tp pct is just 1% it can hapen because currently the VOLATILITY_THRESHOLD=2

then it goes to the `BOTTOM[-1]-B` so account counter will profit right. but since the account counter TP rule by TP pct and stop loss plus is disabled by default. so it will closed on the `TOP[0]-C` make it might not profitable.

so better to make condition like this when the position on the Account main same symbol is already closed && it has pass at least one volatility level to their profit direction. the account counter can doing TP logic as usual.

so that TP logic will be used first before it reaching exit `BOTH:VOLATILITY_TARGET_EXIT` condition

TC: `PROD:REENABLE_TP_LOGIC_AFTER_AT_LEAST_ONE_LEVEL_TO_PROFIT_DIRECTION_PASSED_AND_OTHER_SIDE_WAS_CLOSED`

## Scenario Behavior

Each account has different exit rules.

Account 1 as `main direction` can use all current exit logic.

Account 2 as `counter direction` can use all current exit logic except
take-profit by percentage (`BOTH:TRADITIONAL_TP_SL`) and stop-loss plus
(`PROD:SL_PLUS`). Those rules might exit too early before
`BOTH:VOLATILITY_TARGET_EXIT`, so counter positions prefer structural volatility
exits. Except the `PROD:REENABLE_TP_LOGIC_AFTER_AT_LEAST_ONE_LEVEL_TO_PROFIT_DIRECTION_PASSED_AND_OTHER_SIDE_WAS_CLOSED` condition.

Both positions must support `BOTH:VOLATILITY_TARGET_EXIT`. When this condition
is reached, it resets both sides of the two-account position pair same symbol.

# B. Data structure

## Position

- The position JSON must have the account slug that handles it. the slug is produced [apikey:5firstcharacter]-[sluged account name]

## Balance

- Transfer between account

It will hapend between binance main account and sub account.

Currently we have data of accounts right on the storage.

so on the Setting UI > Management Tab

I need to the selection of which account used for the `main` and `counter`. it will be like two select input.

On the real Binance account, it will use the transfer API.

Maybe Account 1 USD-M can transfer directly to Account 2 USD-M. read the `TRANSFER_FUND.md`.

i think we need email fields on the accounts storage

For debugging, the UI needs a menu to move some balance to the other account. on the `PROD:BALANCE_SECTION`

TC: `PROD:TRANSFER_MONEY_BETWEEN_ACCOUNT_LIVE`

TC: `PROD:TRANSFER_MONEY_BETWEEN_ACCOUNT_SANDBOX`

- The balance object

it will be two, maybe something like this.

```ts
balance1 = {
  spendable,
  // other
};
balance2 = {
  spendable,
  // other
};
```

Think better data structure so it is not redundant definition / calculation. can handle the safeHaven and withdrawal behavior.

i think we need setting ui to set which account used for the withdrawal.

- Balancing balance

The system balances spendable balance every hour and tries to keep both
accounts at 50% / 50%. It only balances `balance.spendable`, not
`balance.reserved`.

TC: `PROD:BALANCING_BALANCE`

- Sharing spendable

The current system logic that checks spendable balance should look at total
spendable: `balance1.spendable + balance2.spendable`.

For example, Account 1 may need balance for an unreserved averaging step, but
Account 1 may not have enough spendable. In that case, the system moves only
the required capital from Account 2 into Account 1.

For example, averaging needs `$100`, Account 1 has only `$60` spendable, and
Account 2 has `$50` spendable.

So we move `$40` from Account 2 into Account 1, and the required `$100` can be
fulfilled.

TC: `PROD:SHARING_BALANCE_SPENDABLE`

## Trading

- Worker Pair

Currently we check spendable balance for a single worker. With two accounts, we
need allocation for a worker pair because we open the same coin in both
directions (`LONG` / `SHORT`) across two accounts.

When there is not enough spendable balance for the worker pair, even if there is
enough for one direction, it is better not to open either position.

TC: `BOTH:ENTRY_BOTH_DIRECTION`

- must entry close the vpoint.price

see `PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT` it protect entry when price drift from vpoint.price to the profit direction. using pct how it has drift.

but allowed to the adverse direction.

since we entering both direction the rule is we must protect

When `VOLATILITY_THRESHOLD < 5`, block drift greater than `0.5%`.
When `VOLATILITY_THRESHOLD >= 5`, block drift greater than `1%`.

the entry zone is current price between vpoint.price + 0.5% && vpoint.price - 0.5% outside than that we must block and wait until the current price is on that entry zone.

so modify the `PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT`

- Exit together when stop loss

when some position is exited by reason hard stop loss from `BOTH:TRADITIONAL_TP_SL` so the same coin position from other account will closed too.

TC: `PROD:EXIT_TOGETHER_WHEN_STOP_LOSS`

# C. UI

## C.1 Both Account Open position

For now we have `Open Positions`, so we need three columns:
`[Open Positions Main]` `Coins usdt pnl` `[Open Positions Counter]`.

the `Coins usdt pnl` column will be show the current net usdt pnl of some coin. based on that position on two account.

When some position is closed on some account but on other account still open so we need to keep showing the closed position on the UI but make the background color is white (default background for current theme). and make chip closed.

i think better to not removing the position json on that open position data list. but on the background it produce copy to the trade history storage. because it was closed.

only remove from "open position data list" when both account has close that coin position.

TC: `PROD:OPEN_POSITION_BOTH_ACCOUNT`

## C.2 Balance Balancing UI

We need to remove section `Entry Signals (0)`. That dashboard column will be
only for:

- `Black Swan / Risk Sentinel`
- `Balance`

The `Black Swan / Risk Sentinel` section keeps showing the live protection
state, timing, and detector evidence. The `Balance` section shows the two
account balance split.

It will show this:

========================================

Total asset = total balance 1 + total balance 2

Two column
[total balance1 / Total asset * 100 ] [total balance2 / Total asset * 100 ]
balance1 breakdown | balance2 breakdown

========================================

TC: `PROD:BALANCE_SECTION`

## C.3 Navbar

Balance information on the navbar is accumulated from the Account 1 balance
object and Account 2 balance object.

## C.4 Live preview

on the setting ui > trading tab we have live preview right.

we must update it, based on this new strategy.

for example like this

entry -> stage 1 -> stage 2 -> stage 3 -> exit level 0

Account main will doing averaging on the stage 1-3

so the margin is increased. but hte account counter is not increase the margin.

so the current stop loss is based on account main

i need to show when it end up with stop loss each stage

- loss amount of the account main
- net loss amount ( loss amount from account main reduced by profit from the account counter ) with their margin on that current stage. because the account main will keep increasing the margin, but not margin from account counter because of its not their adverse level.

# D. Conclusions

The goal is to let the counter leg cover small losses from the main leg, but
losses are still possible from averaging, fees, funding, slippage, transfer
delay, and stop-loss events.

# E. FAQ

## Does `BOTH:VOLATILITY_TARGET_EXIT` overlap with existing volatility exits?

Yes, it is intentionally an OR condition with the existing volatility exits.
When `BOTH:VOLATILITY_TARGET_EXIT` happens first, the system exits with that
rule. Otherwise, `BOTH:VOLATILITY_TARGET_TP`,
`BOTH:VOLATILITY_TARGET_SL_VALUE`, `BOTH:POST_AVERAGE_RESCUE_EXIT`, or normal
stop-loss may exit first when their conditions are met.
