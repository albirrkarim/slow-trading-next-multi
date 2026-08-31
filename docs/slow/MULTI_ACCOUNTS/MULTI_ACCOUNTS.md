# Multi Accounts

My current approach is using multi instance with diferent account when i want to try some strategy.

its not efficient.

better to have multi config for each exchange accounts

## A. Config

### What config are shared (all accounts use same):

- Seting Dialog > Runtime Tab > Automation

- Seting Dialog > Runtime Tab > Monitoring

- Seting Dialog > Black Swan Tab

- Seting Dialog > Notification

- Seting Dialog > Withdraw

- Seting Dialog > MCP

- Seting Dialog > Backup (its like full export import the config)

### What config are belong to each accounts:

- Seting Dialog > Trading Tab

## B. State

### What config are shared (all accounts use same):

- trade history

the storage will be the same but introduce type on the position json

position.account // its a account slug

### What state are belong to each accounts:

Every account has isolated live/sandbox state, positions, balances.
