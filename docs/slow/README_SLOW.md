# Slow Trading

Highly Accurate Trading, Backtested 5 years,

# A. Specifications

The specifications are in [\_SPECS.md](./SPECS/_SPECS.md). They are the source of truth for the behavior of Slow Trading. Before implementing any feature, refer to the specifications to understand the expected behavior and edge cases.

# B. Testing Strategy

The goal is not only "tests pass". The goal is to make the backtest close enough to live/sandbox behavior that the backtest result can be trusted before merging to `main`.

You must see [\_SPECS.md](./SPECS/_SPECS.md) for specific behavior expectations and Testing Code Organization (TC) references.

The required flow is:

```text
_SPECS.md -> TC -> codebase TC marker -> test file
```

First, `_SPECS.md` defines the behavior and its TC. Second, the codebase marks the implementation with the same TC. Third, the test file is designed from the TC marker in the codebase. Do not invent unrelated test groupings first and attach TC labels later.

Use judgment before adding a new test:

- Add or update tests when a change affects documented SLOW behavior, business
  logic, calculations, conditional flows, persistence or storage compatibility,
  API contracts, or a known regression.
- Do not add a dedicated test for a trivial static or cosmetic edit, such as
  moving a fixed sidebar item, changing copy, or reordering non-functional
  markup, unless the change is tied to a documented requirement or known
  regression.
- Do not change production code solely to make an unnecessary test possible.
- Even when a new test is not warranted, run the existing quality gate.

## B.1 Quality Gate

Use `development` as the working branch. Merge to `main` only after the quality gate passes.

Recommended gate:

```bash
npm run quality
```

The quality script must run sequentially, not with shell `&`, so failures cannot be hidden:

```bash
npm run test:code && npm run test:quality && npm run build
```

## B.2 Test Organization

Organize tests by purpose and execution risk.

```text
src/__dev__/main/
  quality/
    unit/
      *.test.ts

    specs/*.ts

  integration/
    exchange/
      okx/
      tokocrypto/
      binance/

  playground/
    experiments/
```

Rules:

- the npm run quality will run all test files in `src/__dev__/main/quality`

- `src/__dev__/main/quality/specs` is include many files based on the TC code.

see the [\_SPECS.md](./SPECS/_SPECS.md)

`runtime.test.ts`

`watch.test.ts`

`entry.test.ts`

`exit.test.ts`

`storage.test.ts`

`notif.test.ts`

- `src/__dev__/main/quality/unit` it containe small but important function that i not list it on the specs docs.
