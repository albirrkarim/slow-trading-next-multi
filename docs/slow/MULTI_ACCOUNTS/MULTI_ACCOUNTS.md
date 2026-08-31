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

We can toggling sanbox and set differen sanbox starting balance each account

## B. State

### What config are shared (all accounts use same):

- trade history

the storage will be the same but introduce type on the position json

position.account // its a account slug

### What state are belong to each accounts:

Every account has isolated live/sandbox state, positions, balances.

## C. Important

- Also update the backtest and the quick backtest system

## D. FAQ

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

10. How is an account slug created, and can it change?

Every account has an immutable, unique slug. The slug is generated from the
account name only when the account is created. Changing the account name later
must not change its slug.

For example, an account initially named `Main Account` receives the slug
`main-account`. If that slug already exists, use a numeric suffix such as
`main-account-2`.

A deleted account's slug must never be reused because trade history can still
contain positions belonging to that account. Positions and withdrawal schedules
reference the account using this immutable slug:

```typescript
position.account = "main-account";
schedule.account = "main-account";
```

11. What should happen when deleting an account with open positions or withdrawal schedules?

blocking deletion until those dependencies are resolved.

12. If one account fails during its sequential cycle, should SLOW continue processing the remaining accounts? yes.

13. Is the shared **Daily PnL Auto-Entry Stop** calculated separately for each account or from combined trade history?

Its combined

14. Should dashboard totals and trade history default to all accounts combined, or require selecting one account? I recommend combined totals with an account filter.

Annotation 1 Since all accounts share one trade-history storage, the dashboard needs to decide what to display.

For example:

```text
Account A profit: +100 USDT
Account B loss:    -30 USDT
```

Two possible dashboard behaviors:

- **Combined view:** shows total profit of `+70 USDT`.
- **Account view:** selecting Account A shows only `+100 USDT`; selecting Account B shows only `-30 USDT`.

Better to supporting both:

- Show all accounts combined by default.
- Add an account filter for viewing one account.
- Each history row displays its account name or slug.

1. Should a backtest run one selected account’s Trading configuration, or run every enabled account and compare their results?

run with every enabled account. but the result will combined. into single result positions[]

no need to compare the result. but remember that table history should show which account doing that trade

2. Should Quick Backtest also have an account selector and use that account’s Trading configuration and sandbox starting balance?

currenlty it has one input for startinng balance. so we need multi starting balance for each enabled account

3. Should backtest positions receive the same `position.account` slug?

yes

4. because Daily PnL Auto-Entry Stop is combined, should live and sandbox PnL remain separate?

I strongly recommend combining accounts within the same mode only—sandbox profit/loss should never stop live entries.

No dont over think it. it will never hapens. just combine it
