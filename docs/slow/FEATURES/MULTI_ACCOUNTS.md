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

14. Should dashboard totals and trade history default to all accounts combined, or require selecting one account?

Annotation 1 Since all accounts share one trade-history storage, the dashboard needs to decide what to display.

For example:

```text
Account A profit: +100 USDT
Account B loss:    -30 USDT
```

Two possible dashboard behaviors were considered:

- **Combined view:** shows total profit of `+70 USDT`.
- **Account view:** selecting Account A shows only `+100 USDT`; selecting Account B shows only `-30 USDT`.

Final decision:

- The dashboard is always combined across all enabled accounts.
- Do not show a global dashboard account selector.
- Each history row displays its account name or slug.
- A feature that needs account-specific editing or actions must provide its own
  local account selector instead of changing the entire dashboard.

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

## E. Persistence and Runtime Contract

Accounts are stored as profiles keyed by an immutable slug. The profile owns
credentials, the enabled flag, Trading-tab configuration, and Sandbox controls:

```typescript
interface SlowTradingAccount {
  slug: string;
  type: "binance";
  name: string;
  description: string;
  credentials: BinanceCredentials;
  enabled: boolean;
  trading: SlowTradingAccountTradingConfig;
  sandbox: {
    enabled: boolean;
    initialBalanceUSDT: number;
  };
}
```

The shared config remains stored once. Live and sandbox memory are stored under
the account slug, while history remains shared:

- `config.json` owns only shared strategy configuration and shared runtime
  controls. It must not persist Trading-tab or per-account Sandbox settings.
- `accounts.json` stores complete account profiles and is the sole owner of
  credentials, enabled state, Trading-tab configuration, and Sandbox settings.
- `memory.json` owns live and sandbox execution memory under each immutable
  account slug.

```typescript
interface SlowTradingMemoryFile {
  accounts: Record<
    string,
    {
      live: SlowTradingModeState;
      sandbox: SlowTradingModeState;
    }
  >;
}
```

Production uses one Binance market, one trading mode, and one configured coin
list. A cycle therefore has exactly two scopes; there are no separate market
groups:

```text
BEGIN CYCLE

prepare shared Binance public market data once

for each eligible account sequentially
  apply account guards and decisions
  refresh private balance and positions
  execute account orders
  persist isolated account state

END CYCLE
```

The shared phase owns account-independent public inputs such as volatility,
market-time klines, price normalization, prices, funding rates, and 24-hour
volume. Volatility symbols remain sequential inside this single shared phase to
limit Binance request pressure. The optimization removes duplicate work across
accounts; it does not replace controlled requests with a parallel burst.

Every enabled account executes in deterministic sequential order after shared
preparation. A disabled account does not open new positions, but it is still
executed while it owns an open position so exits, averaging, monitoring, and
protection continue. An account error is logged and does not stop later
accounts. Empty monitoring stages perform no public or private exchange I/O
when no eligible account owns an applicable open position.

Black Swan follows the same boundary: BTC and market-breadth evidence is
captured once, then applied sequentially to each eligible account. Application
remains per account because Black Swan state, recovery acknowledgement,
positions, emergency exits, and notifications are independently persisted.

See [`docs/slow/SPECS/CYCLE.md`](../SPECS/CYCLE.md) for the detailed production
cycle architecture and execution boundaries.

Standard Backtest and Quick Backtest execute every enabled account with that
account's Trading configuration. Each account has its own starting balance and
simulation memory. The final report combines all closed positions into one
`positions[]`; every position keeps its account slug and the history table shows
it. Quick Backtest exposes one starting-balance input per enabled account.

The dashboard always loads all enabled accounts and combines balances, open
positions, and history. It has no global account selector. Shared Daily PnL uses
the combined shared history. Any account-specific feature owns a local account
selector that changes only that feature.

The Trading tab edits one account at a time. Its `Editing Account` selector is
placed directly above the Trading form and changes only the profile being
edited; it does not choose which account executes. Runtime > Sandbox renders
one visible Sandbox section per account, including that account's mode toggle,
initial balance, and reset action. The shared Management tab has no execution
account selector.

The navbar renders one account chip and one independent balance summary for
every enabled account. Each chip shows that account's current live or sandbox
mode. Disabled accounts are omitted from the navbar even when they continue
managing an existing position.

## F. Required Test Codes (TC)

Following `docs/slow/SPECS/_SPECS.md`, the implementation and its tests must use
these exact TC comments:

- `PROD:MULTI_ACCOUNT_IMMUTABLE_SLUG`
- `PROD:MULTI_ACCOUNT_STATE_ISOLATION`
- `PROD:MULTI_ACCOUNT_SANDBOX_ISOLATION`
- `BOTH:MULTI_ACCOUNT_POSITION_OWNER`
- `BOTH:MULTI_ACCOUNT_HISTORY_OWNER`
- `PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE`
- `PROD:MULTI_ACCOUNT_SHARED_MARKET_PREPARATION`
- `PROD:MULTI_ACCOUNT_SEQUENTIAL_ACCOUNT_EXECUTION`
- `PROD:MULTI_ACCOUNT_PRIVATE_STATE_ISOLATION`
- `PROD:MULTI_ACCOUNT_FAILURE_ISOLATION`
- `PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY`
- `PROD:EMPTY_MONITORING_NO_MARKET_IO`
- `PROD:BLACK_SWAN_SHARED_EVIDENCE`
- `PROD:BLACK_SWAN_ACCOUNT_STATE_FAN_OUT`
- `PROD:MULTI_ACCOUNT_DELETE_DEPENDENCY_GUARD`
- `PROD:MULTI_ACCOUNT_WITHDRAWAL_OWNER`
- `PROD:MULTI_ACCOUNT_COMBINED_DAILY_PNL`
- `PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD`
- `PROD:MULTI_ACCOUNT_CONFIG_OWNERSHIP`
- `BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST`
