# Agent Instructions

These instructions apply to the whole repository.

## Pre-Implementation

- Read `docs/slow/SPECS/_SPECS.md` before changing SLOW trading behavior.
- Read the relevant TypeScript JSDoc/type comments before changing a model, config, API, storage shape, exchange adapter, trading executor, or dashboard component.
- Check both backtest and production/live flows before deciding where a behavior belongs.

## Coding Style

- Prefer grouped APIs over scattered exported functions.
- When a module grows several related operations, expose an object shaped like:

```ts
const entity = {
  category: {
    //
  },
};

export default entity;

import entity from "./some/index";

entity.category.functionName();
```

- Avoid broad barrel exports for implementation modules because they encourage
  scattered imports. Do not expose module internals like this from an `index.ts`:

```ts
export * from "./service";
export * from "./storage";
export * from "./watch-reserve";
```

Prefer exporting the grouped entity as the public API, plus explicit type exports
when needed:

```ts
export { default } from "./entity";
export type * from "./types";
```

- Follow the existing exchange-library style where callers import one grouped entity instead of many unrelated helpers.
- Keep components small and focused. Prefer composing multiple small components over one large component.
- Always try to reuse existing types and functions before creating new ones.
- Add simple JSDoc for functions that compute something, especially pure or utility functions.
- Do not add JSDoc to React components unless it is genuinely needed.
- Prefer `condition && <Component />` for JSX conditional rendering instead of `condition ? <Component /> : null`.
- Keep implementation boundaries clear:
  - `src/lib/dynamic/**` is backtest/dynamic simulation logic.
  - `src/lib/slowTrading/**` is SLOW persistent/runtime orchestration.
  - `src/lib/trading/execute/**` is entry, exit, averaging, and execution accounting.
  - `src/lib/exchange/**` is exchange abstraction and adapter logic.
- Do not introduce broad refactors while fixing a specific behavior.

## Efficiency and Storage

- Do not be lazy about efficiency.
- When writing JSON to disk, save storage. Prefer compact JSON output instead of pretty-printed JSON unless human readability is required.
- When designing types or objects persisted to disk, prefer short field names where the meaning stays clear:
  - Use `t` for time fields instead of `time` or `timeMs`.
  - Use `pct` for percent fields instead of `percent`.

## Testing Scope

- Add or update tests when a change affects documented SLOW behavior, business logic, calculations, conditional flows, persistence or storage compatibility, API contracts, or a known regression.
- Do not add dedicated tests for trivial static or cosmetic edits, such as moving a fixed sidebar item, changing copy, or reordering non-functional markup, unless the change is tied to a documented requirement or known regression.
- Do not change production code solely to make an unnecessary test possible.
- Even when a new test is not warranted, run the existing post-implementation quality gate.

## Post-Implementation

- Re-think the change before finishing:
  - Does this work in backtest?
  - Does this work in production/live trading?
  - Does this affect sandbox differently?
  - Does persistent storage still remain compatible?
- Run:

```bash
npm run type
npm run quality
```

- If a check cannot be run, explain why in the final response.
