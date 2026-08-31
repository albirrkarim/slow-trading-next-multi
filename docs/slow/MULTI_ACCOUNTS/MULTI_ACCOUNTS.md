# Multi Accounts

My current approach is using multi instance with diferent account when i want to try some strategy.

its not efficient.

better to have multi config for each exchange accounts

## A. Config

### What config are shared (all accounts use same):

- Seting Dialog > Runtime Tab > Automation

- Seting Dialog > Runtime Tab > Monitoring

- Seting Dialog > Black Swan Tab

- Seting Dialog > Management Tab

- Seting Dialog > Notification

- Seting Dialog > Withdraw

- Seting Dialog > MCP

- Seting Dialog > Backup (its like full export import the config)

- Seting Dialog > Runtime Tab > Dashboard Data

- Seting Dialog > Runtime Tab > Debugging

### What config are belong to each accounts:

- Seting Dialog > Trading Tab

- Seting Dialog > Runtime Tab > Sandbox

## B. State

### What config are shared (all accounts use same):

- trade history

the storage will be the same but introduce type on the position json

position.account // its a account slug

### What state are belong to each accounts:

Every account has isolated live/sandbox state, positions, balances.

## C. FAQ

1. Does every configured account run on every SLOW cycle, or only enabled/selected accounts?

So the each account will have the data enabled or disabled. when enabled so their strategy will be applied

2. Must all accounts use the same exchange type? “Management Tab” is shared, but Exchange Type currently lives there.

Yes. its same exchange binance.

4. Does the shared withdrawal schedule run separately against every account, or against one designated account?

we need to have data which withdrawal schedule belong to some account.

6. Should legacy positions without `position.account` automatically belong to the default account?

no need doing legacy migration things its a new fresh instance.

8. Should account cycles execute sequentially or concurrently?

sequential

9. If an account is disabled while it has open positions, should SLOW continue monitoring and exiting those positions?

disabling only new entries while existing positions remain managed.

3. Should each withdrawal schedule store the account slug, for example `schedule.account`?
4. Can an account slug ever change? I recommend making it immutable because positions, history, and withdrawal schedules reference it.
5. What should happen when deleting an account with open positions or withdrawal schedules? I recommend blocking deletion until those dependencies are resolved.
