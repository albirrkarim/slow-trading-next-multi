I need it record, and showing to the UI page /slow on the bottomest using the headermetrics component, only when i click expand so it will load the data and showing to the UI as table.

- Error Logging

i need to record the error log like execution failed, api call, etc into `errors.json`

Every new error is persisted with `status: "new"`. The status is required and
may be changed to `"solved"` or `"dismissed"` during operator triage. A solved
error is confirmed fixed; a dismissed error needs no action. Either state may
be reopened as `"new"`.

TC: `PROD:ERROR_LOG`

Only persistent errors with `status: "new"` activate the Error Logs section's
red-tinted background, red border, warning icon, and red count. Solved and
dismissed records remain available without keeping the dashboard in an alert
state. The section polls while the dashboard is open so newly recorded errors
activate the highlight.

TC: `PROD:ERROR_LOG_HIGHLIGHT`

The Error Logs section provides New, Solved, Dismissed, and All filters. An
operator can update one record or select visible records and mark them solved
or dismissed together. Status updates and error appends must use one serialized
atomic read-modify-write path so triage cannot overwrite a concurrently recorded
error. Permanent deletion remains a separate action.

TC: `PROD:ERROR_LOG_TRIAGE`

Each row can copy its complete persisted JSON object. The section can also copy
all currently loaded `"new"` records as one JSON array, including stacks and
diagnostic details.

TC: `PROD:ERROR_LOG_COPY`

Legacy records are migrated explicitly through
`/api/alter/error-log-status`, which assigns `"new"` only when `status` is
missing. Runtime log loading does not normalize legacy records.

- Coin Management Log

Every configured-symbol addition or removal is persisted to
`management.json`. Each record includes the action (`"add"` or `"remove"`),
symbol, timestamp, source, and exact reason. Sources distinguish dashboard
edits from live or sandbox automatic removal by absolute vPoint level,
minimum price, market cap, or a stored vPoint percent threshold.
Notification delivery is separate: a notification failure must not erase the
persistent management record.

TC: `PROD:MANAGEMENT_LOG`

The `/slow` dashboard displays `Coin Management Logs` immediately below
`Error Logs`. It uses `HeaderMetrics`, requests data only when first expanded,
and presents the records as a table. Operators can permanently delete one row
or use `Delete All`; both actions require confirmation.

TC: `PROD:MANAGEMENT_LOG_UI`

- Safe Haven Log

When it increase or decrease or being modified i need it recorded

`safe_haven.json`

TC: `PROD:SAFE_HAVEN_LOG`

- Withdrawal Log

The both manual and automatic schedule withdrawal must have logged.

`withdrawals.json`

TC: `PROD:WITHDRAWAL_LOG`

- Manual withdrawal actions are capped at `2 USDT` by the server.

TC: `PROD:MANUAL_WITHDRAWAL_CAP`

- Automatic withdrawals use the schedule's configured amount. Safe Haven must
  contain the full amount before the withdrawal can execute.

TC: `PROD:AUTOMATIC_WITHDRAWAL_AMOUNT`

- In Binance Futures mode, a live withdrawal first checks the Spot USDT
  balance. It transfers only the withdrawal shortfall from USDⓈ-M Futures to
  Spot, then submits the external withdrawal. Rechecking Spot prevents a retry
  from transferring the same amount twice.

TC: `PROD:FUTURES_WITHDRAWAL_TRANSFER`

- After a Futures-to-Spot transfer, SLOW waits until Binance's withdrawal
  wallet reports the requested USDT as free before submitting the withdrawal.
  If Binance still returns transient currency-ownership error `-4024`, SLOW
  retries once with the same client withdrawal id.

TC: `PROD:FUTURES_WITHDRAWAL_SETTLEMENT`
