- i need to have button that can replace local mac full persistent storage, with the online version.

data is sent through export api, so i can just do one click and the background will sync between this online server and local on my macbook.

on `https://wealth.reinventwp.com`

so the reproduce bug will be easier.

AI agent (you) can hit that api, when i ask you to debug about the online data.

Behavior:

- Online server exposes a persistent-storage export API.
- Every dashboard server has a sync API/button that can clone persistent storage
  from another dashboard server into the current server.
- The sync fetches the source server export, writes it into a staging directory,
  creates a timestamped backup of the current server's persistent storage, then
  replaces the current persistent storage with the source version.
- The replace action is available outside localhost so one deployed server can
  clone another. It remains protected by dashboard authentication, requires an
  explicit confirmation in the UI, and creates a backup before replacement.
- The export API remains protected by dashboard auth and can also accept `SYNC_TOKEN` for server-to-server sync.
- The button is in Settings > Runtime > Debugging.

TC: `PROD:SYNC_ONLINE_TO_LOCAL`

## Backtest trade chart averaging

When a closed-trade chip is opened from the backtest monthly report, the trade
chart receives the selected persisted position. The chart displays the initial
entry at `opened.price`, one labelled circular marker at the time and price of
every persisted `strategy.averaging.executions` item, and a dashed horizontal
line at `exposure.averageEntryPrice`. After averaging, the line is labelled
`Avg Entry`; otherwise it is labelled `Entry`.

The selected trade's entry and averaging markers are supplied only by the
position-aware chart layer so they are not duplicated by the surrounding
historical markers.

Above the chart, the review displays an explicit `Not averaged` status or the
number of averaging executions followed by one debug record per execution. It
also reuses the production level-sequence chips. Because backtest exit history
contains a pre-close position snapshot, the review copy may recover its exit
level from the existing exit message; this enrichment is display-only and does
not modify the simulation result.

TC: `BTEST:BACKTEST_TRADE_CHART_AVERAGING`
