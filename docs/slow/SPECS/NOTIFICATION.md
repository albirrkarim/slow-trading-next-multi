- Entry: Sent when SLOW successfully opens an entry position.

Sandbox entry must also send this notification, with the notification subject prefixed by `[SANDBOX]`.

TC: `PROD:NOTIF_ENTRY`

- Entry Failed: Sent when SLOW wants to enter but order execution or validation fails.

TC: `PROD:NOTIF_ENTRY_FAILED`

- Exit: Sent when SLOW successfully closes a position.

Sandbox exit must also send this notification, with the notification subject prefixed by `[SANDBOX]`.

TC: `PROD:NOTIF_EXIT`

- Exit Failed: Sent when SLOW tries to close a position but the exit execution fails.

TC: `PROD:NOTIF_EXIT_FAILED`

- Average / Add Position: Sent when SLOW successfully averages or adds to an existing position via watch logic.

Sandbox averaging must also send this notification, with the notification subject prefixed by `[SANDBOX]`.

TC: `PROD:NOTIF_AVG`

- Average / Add Position Failed: Sent when SLOW tries to average or add to an existing position but fails.

TC: `PROD:NOTIF_AVG_FAILED`

- High Volatility: This is the single volatility-level notification. Each
  delivery channel owns its threshold at
  `notification.<channel>.types[].params.level` on the
  `NOTIF_HIGH_VOLATILITY` item. It is sent to that channel when a symbol reaches
  `abs(level) >= params.level`. The threshold defaults to `3`. Its transition
  state is tracked independently per channel and resets after the symbol drops
  below that channel's configured absolute level.

TC: `PROD:NOTIF_HIGH_VOLATILITY`

- Stale Position: Each delivery channel owns its delay at
  `notification.<channel>.types[].params.hour` on the
  `NOTIF_STALE_POSITION` item, defaulting to `1`. It is sent once to that
  channel when an open position remains open for strictly more than the
  configured number of hours after reaching its first post-entry target
  vPoint. For LONG, the anchor is the first `TOP` after entry. For SHORT, the
  anchor is the first `BOTTOM` after entry. Later vPoints do not replace this
  anchor. Only positions still open after the current cycle's exit processing
  are eligible. Production and sandbox use the same trigger; sandbox
  notification subjects are prefixed with `[SANDBOX]`.

Notification type settings use a rich route-local shape:

```json
{
  "notification": {
    "telegram": {
      "enabled": true,
      "types": [
        {
          "id": "NOTIF_HIGH_VOLATILITY",
          "params": { "level": 4 }
        },
        {
          "id": "NOTIF_STALE_POSITION",
          "params": { "hour": 1 }
        },
        {
          "id": "NOTIF_LONG_OPEN_POSITION",
          "params": { "hour": 24 }
        }
      ]
    }
  }
}
```

Telegram and Email may use different parameters. Existing storage is converted
once through `/api/alter/notification`; runtime normalization only accepts the
rich type shape.

TC: `PROD:NOTIF_STALE_POSITION`

- Long Open Position: Each delivery channel owns its duration threshold at
  `notification.<channel>.types[].params.hour` on the
  `NOTIF_LONG_OPEN_POSITION` item, defaulting to `24`. It is sent once to that
  channel when a position remains open for strictly more than the configured
  hours after its persisted `entryTime`. Only positions still open after the
  current cycle's exit processing are eligible. It does not depend on target
  vPoints. Production and sandbox use the same trigger; sandbox notification
  subjects are prefixed with `[SANDBOX]`.

TC: `PROD:NOTIF_LONG_OPEN_POSITION`

- Management Action: Sent when the configured Coin Management Symbols list is
  changed. Each channel configures the action filters independently on the
  `NOTIF_MANAGEMENT_ACTION` item:

  ```json
  {
    "id": "NOTIF_MANAGEMENT_ACTION",
    "params": { "add": true, "remove": true }
  }
  ```

  `params.add` controls notifications for symbols added to the config and
  `params.remove` controls notifications for removed symbols. Missing params on
  this enabled type normalize to `true` for backward compatibility.

  Every delivery includes the action, symbol, source, exact reason, and action
  timestamp. Current sources include dashboard/API edits and live-cycle Coin
  Management auto-removal. Automatic-removal reasons identify whether the
  absolute-vPoint threshold, minimum-price threshold, minimum-market-cap
  threshold, stored-vPoint percent threshold, or a combination caused removal.
  Notification failure is logged and does not roll back the completed config
  mutation.

TC: `PROD:NOTIF_MANAGEMENT_ACTION`

- Daily Trade Performance: Sent on the first successful SLOW cycle after a UTC
  day closes. It reports the immediately previous completed UTC day once per
  enabled channel and mode, including days with zero closed trades. The report
  uses the same day-card metrics as Daily PnL Calendar: Trade PnL USD, summed
  Trade PnL %, trade count, wins, losses, win rate, Balance PnL USD, Balance PnL
  %, start balance, and end balance. Closed trades are assigned by `closed.t`;
  the persisted daily balance snapshot is the ending balance and the latest
  earlier snapshot (or the mode starting balance) is the starting balance.
  Missing balance data is displayed as `-`. Sandbox subjects are prefixed with
  `[SANDBOX]`. The compact subject format is
  `[SANDBOX][DAILY] 10 Aug UTC | net USD | winning USD losing USD | WR N% (NW / NL)`.

TC: `PROD:NOTIF_DAILY_PERFORMANCE`

- Daily PnL Entry Stop: Sent when the current UTC-day navbar `USD` PnL first
  reaches or falls below `runtime.autoEntryDailyPnlLimitUSDT`. It uses net
  closed-trade PnL, not accumulated losses, and is enabled by default for each
  notification route. Delivery is transition-based per channel and mode: it
  sends once while breached, resets after PnL recovers above the threshold, and
  may send again on a later breach. A new UTC day starts a new transition.
  Sandbox subjects are prefixed with `[SANDBOX]`.

TC: `PROD:NOTIF_DAILY_PNL_LIMIT`

- Error: Sent for operational SLOW errors outside normal entry and exit flows.

TC: `PROD:NOTIF_ERROR`

Email notification subjects are prefixed with `[process.env.APP_NAME]` when
`APP_NAME` is set, so multi-instance deployments can identify which server sent
the message. The notification settings UI also provides one-off Telegram and
Email test buttons.

Every notification-type row provides an example-preview icon. It opens a
read-only dialog containing a representative title and message for that type
and channel. Parameterized examples use that channel's current level or hour
setting. Opening or closing a preview must not send a notification or modify
the notification configuration.

TC: `PROD:NOTIF_EXAMPLE_PREVIEW`

TC: `PROD:NOTIF_APP_NAME_PREFIX`

- Email CRM delivery

SLOW sends email exclusively through the dedicated n8n CRM email webhook. It
does not open direct SMTP connections. The webhook receives the same
`APP_NAME`-prefixed subject, body, and recipient payload. If CRM delivery fails,
notification failure remains non-fatal to the trading cycle.

TC: `PROD:NOTIF_EMAIL_CRM_PROXY`
