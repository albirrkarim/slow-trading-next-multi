# MCP

SLOW exposes an HTTP MCP endpoint so Codex, ChatGPT Connector, `mcporter`, and
other agents can query or manage selected dashboard data through the existing
project APIs.

## Endpoint

- MCP endpoint: `/api/mcp`
- No-auth connector endpoint: `/api/mcp/<mcp-token>`
- Transport: HTTP JSON-RPC
- Auth: `Authorization: Bearer <mcp-token>`
- Token management API: `/api/slow-trading/mcp-tokens`
- Settings UI: `Settings > MCP`
- App identity: `APP_NAME` is exposed in the MCP info response,
  `initialize.serverInfo`, initialize instructions, and every tool description.

MCP is disabled until at least one token exists, is enabled, and has the
permission required by the requested tool.

For local development, `.env` usually sets `APP_NAME=localhost`, so agents can
tell they are connected to the local SLOW instance instead of `fast`, `holy`, or
`wealth`.

## Token Model

Each MCP token has:

- `name`
- `enabled`
- `permissions`
- `createdAt`
- `lastUsedAt`
- `secretAvailable`

Token secrets are not stored as plaintext. The server stores:

- a SHA-256 hash for authentication
- an encrypted copy of the token secret so the Settings UI can show/copy it
  again

Use `Settings > MCP > Show` to reveal a token secret.

## ChatGPT Connector

For ChatGPT Connector, choose **No Auth** and put the MCP token in the URL:

```text
https://fast.reinventwp.com/api/mcp/<mcp-token>
```

Examples:

```text
https://fast.reinventwp.com/api/mcp/slow_mcp_xxx
https://holy.reinventwp.com/api/mcp/slow_mcp_xxx
https://wealth.reinventwp.com/api/mcp/slow_mcp_xxx
```

Even though ChatGPT is set to **No Auth**, the URL token is still the secret.
Only share connector URLs with trusted tools/users.

For Codex and `mcporter`, keep using the normal bearer-token endpoint:

```text
https://fast.reinventwp.com/api/mcp
```

## Permissions

- `tags.read`
- `tags.write`
- `coin_metadata.read`
- `coin_metadata.write`
- `coin_metadata.broadcast`
- `balance.read`
- `trade_history.read`

Write permissions are separate from read permissions so a token can be safely
limited to read-only workflows.

## Tools

### Tags

- `slow_tags_list`
- `slow_tags_create`
- `slow_tags_update`
- `slow_tags_delete`

Tag tools manage reusable coin tags, including color, description, and optional
filter JSON.

### Coin Metadata

- `slow_coin_metadata_get`
- `slow_coin_metadata_update`
- `slow_coin_metadata_broadcast`

Coin metadata tools read or edit descriptions and tag assignments. Metadata
writes auto-broadcast through the existing coin metadata sync behavior. Manual
broadcast is also available as a separate tool.

### Trade History

- `slow_trade_history_read`
- `slow_finance_summary`

Trade history is read-only. It can return closed history and optional open
positions for the active, live, or sandbox mode. It concatenates positions from
every enabled account, globally sorts the combined rows, and applies the symbol
filter and result limit after aggregation. Every position retains its immutable
account slug. The response also identifies the included accounts. Disabled
accounts are excluded.

`slow_finance_summary` accepts an inclusive UTC `start`/`end` range of at most
731 days and defaults to live mode. It returns realized net P&L, winning and
losing trade totals, known persisted fees, closed-trade coverage, and daily
points in USDT. It reads only closed positions by `closed.t`; balance changes,
deposits, withdrawals, open positions, and unrealized P&L are excluded. Gross
profit and gross loss are sums of the already-net winning and losing trade
results, so known fees are informational and must not be subtracted again.
The summary is calculated once from the combined closed history of every
enabled account and includes the identities of those accounts. Disabled
accounts do not contribute trades or P&L.

TC: `PROD:MCP_FINANCE_SUMMARY`

TC: `PROD:MULTI_ACCOUNT_COMBINED_MCP_DATA`

### Balance

- `slow_balance_read`

The balance tool uses the dedicated `balance.read` permission and accepts
`active`, `live`, or `sandbox` mode. It returns one documented USDT balance
object summed across all enabled exchange accounts, plus an `accounts[]`
breakdown containing each enabled account's slug, name, mode, and balance.
Disabled accounts are excluded. Both aggregate and account balances contain
`available`, `spendable`, `reserved`, `safeHaven`, `locked`, and `totalAsset`,
and the response includes equations and a plain-language meaning for every
field.

`available` is the exchange-free quote balance before SLOW's virtual reserve
subtraction. `spendable`, `reserved`, and `safeHaven` are virtual allocations
inside that available balance. `locked` is active-position margin and must not
be subtracted from available again. `totalAsset = available + locked`; it is
not floating equity and does not include unrealized P&L.

Live reads attempt an exchange balance refresh and fall back to the most recent
persisted balance if the exchange read fails. Sandbox reads use simulation
state and do not query the exchange.

TC: `PROD:MCP_BALANCE`

TC: `PROD:MULTI_ACCOUNT_COMBINED_MCP_BALANCE`

All account-scoped MCP reads therefore use the same enabled-account boundary:
balance, trade history, open positions, and finance totals are combined across
enabled accounts. Tags and coin metadata are shared instance datasets and are
returned once rather than duplicated for each account.

## Agent Confirmation Rule

Every write tool description must tell the agent to ask for confirmation before
calling the tool.

Required agent flow:

1. Show a draft of exactly what data will be created, updated, deleted, or
   broadcast.
2. Ask the user to confirm.
3. Call the write tool only after confirmation.

This applies to tag writes, coin metadata writes, and broadcast actions.

## Expected Questions

The MCP tools should make these workflows easy for an agent:

- How many USDT did we make this month?
- What is the current spendable, reserved, Safe Haven, locked, and total USDT balance, and what does each value mean?
- What is the portfolio growth percentage this month?
- Is this coin description correct?
- Are the assigned category tags correct for this coin?
- Which coins have or do not have a specific tag?
- Edit a coin description or tag assignment after user confirmation.

## Scope

MCP wraps current SLOW APIs/storage behavior. Do not create unrelated new APIs
just for MCP unless the current API cannot express the required operation.

Local and online instances can both expose MCP. Local instances can also
broadcast metadata to peer deployments when the token has
`coin_metadata.broadcast`.

## Performance Notes

- Keep MCP tools thin wrappers around existing storage/API behavior.
- Do not load heavy history unless a tool needs it. Balance reads hydrate open
  positions because locked margin is part of the balance contract.
- Keep token list responses sanitized; never expose token hashes or encrypted
  secret blobs in dashboard state.
- Follow the repository boundaries from `AGENTS.md`.

## Local `mcporter`

The local Mac has a configured mcporter server:

- name: `slow-trading-next-local`
- endpoint: `http://localhost:3010/api/mcp`

Useful checks:

```bash
mcporter list slow-trading-next-local --schema
mcporter call slow-trading-next-local.slow_coin_metadata_get symbol:BTC
mcporter call slow-trading-next-local.slow_balance_read mode:active
mcporter call slow-trading-next-local.slow_trade_history_read limit:5
mcporter call slow-trading-next-local.slow_finance_summary start:2026-08-01 end:2026-08-31 mode:live
```
