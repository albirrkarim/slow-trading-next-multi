# Specification

I need to know the current system behavior, for checking up. make sure AI dont mess up in the future. So i write here the current behavior.

This behavior must be tested. because it is my strategy

Both test file and the code must have commented testing code like this:

```typescript
// BOTH:MONITORING_OPEN_POSITION

// BTEST:MONITORING_OPEN_POSITION

// PROD:MONITORING_OPEN_POSITION
```

Information:

- The `TC`is short name for testing code.

- Prefix `BOTH:` is behavior that must be exist on backtest and production
  it mean the testing will be twice, because it testing the backtest and the production code. where the code of having the prfix `BOTH:` is defined.

- Prefix `BTEST:` is behavior that must be exist in backtest only

- Prefix `PROD:` is behavior that must exist in the production/runtime SLOW flow,
  not in the backtest flow.
  It may apply to live mode, sandbox mode, or both, depending on the TC name.
  For example, `PROD:*_SANDBOX` means the production/runtime sandbox mode.

## A. Runtime Behavior (runtime.test.ts)

readmore `RUNTIME.md`

## B. Trading Features

readmore `TRADING.md`

## C. Storage (storage.test.ts)

readmore `STORAGE.md`

## D. Notification (notif.test.ts)

readmore `NOTIFICATION.md`

## E. Logging

readmore `LOGGING.md`

## F. Debugging

readmore `DEBUGGING.md`

# G. Edge Cases

readmore `EDGE_CASES.md`

# H. Decision Engine

readmore `DECISION_ENGINE.md`
