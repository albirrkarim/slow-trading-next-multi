# Data Type Optimization

Status: implemented. This is the canonical runtime and persisted position
contract after running `/api/alter/position`.

## Goals

- Keep persisted data directly usable by production and backtest code.
- Use one canonical key for each fact.
- Make units explicit for money, percentages, and timestamps.
- Separate volatility signals, position exposure, strategy state, and reporting.
- Store source data and durable snapshots; derive display-only values.
- Migrate existing JSON once through `/api/alter/position` instead of maintaining
  permanent compatibility branches.
- Replace runtime readers, writers, and types with the canonical structure in
  the same change. Do not add a schema-version field or legacy read path.

## Conventions

- Timestamps use Unix milliseconds and the compact key `t`.
- Percentage values use percentage points and the suffix `Pct`.
  `3.25` means `3.25%`, not `0.0325`.
- USDT values use the suffix `Usdt`.
- Persisted enum values do not contain display formatting. Store `COMMON`,
  not `[COMMON]`.
- Optional fields may represent an explicit storage default. For position
  action sources, an omitted `source` means `AUTO`.
- High-volume time-series records may use compact keys such as `{ t, pct }`.
- Monetary values are rounded when serialized, without changing the precision
  used by execution calculations.
- Human-readable times, durations, and labels are generated when rendering.
- Entry and close messages are immutable diagnostic snapshots. They may be
  displayed or reused by notifications, but must never be parsed as accounting
  or control data.

## Volatility Point

```ts
export interface VolatilityPoint<T = unknown>
  extends VolatilityPointRuntimeAddOn<T> {
  /** Stable point identifier, for example B_cbf_12_04_26_04_20. */
  id: string;

  /** Unix timestamp in milliseconds. */
  t: number;

  /** Pivot direction: top or bottom. */
  l: "T" | "B";

  /** Change from the previous pivot in percentage points. */
  pct: number;

  /** Price at the pivot. */
  p: number;

  /** Base-asset volume. */
  vb: number;

  /** Quote-asset volume. */
  vq: number;

  /** Signed strategy level assigned to the point. */
  lvl: number;
}
```

Volatility storage should be migrated wherever volatility-point JSON exists,
including:

- `storage/persistent/instances/<port>/slow/<exchange>/volatility`
- `storage/datasets/UI_TEMP/VOLATILITY`

The `/api/alter/volatility` migration should write the canonical form so
callers do not repeatedly convert legacy records.

## Normalized Price

```ts
export interface PriceNorm {
  /** Unix timestamp in milliseconds. */
  t: number;

  /** Highest price in the normalization window. */
  x: number;

  /** Lowest price in the normalization window. */
  n: number;

  /**
   * Current normalized price on the 0-1 scale.
   * Persist with at most two decimal places.
   */
  c: number;
}
```

## Position

The current flat position object mixes execution facts, mutable exposure,
strategy state, derived display values, and reporting snapshots. It also uses
`entryId` and `exitId` for volatility-point IDs, even though those names appear
to identify trade executions.

The proposed structure gives each concern an explicit owner.

```ts
import type { DecisionEngineVersionType } from "@/lib/brain";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { TradingMode, UnifiedPosition } from "@/lib/exchange";

/** SLOW stores directional positions and does not persist exchange NET mode. */
export type PositionDirection = Exclude<UnifiedPosition["side"], "NET">;
export type PositionExecutionMode = "live" | "sandbox";
export type PositionEntrySourceOverride = "MANUAL" | "BYPASS";
export type PositionOpenReason =
  | "COMMON"
  | "MANUAL"
  | "BYPASS"
  | "UNKNOWN";
export type PositionCloseSourceOverride = "MANUAL" | "EXCHANGE";

/** Required volatility-point identity stored by a position. */
export type PositionVPointRef = Pick<VolatilityPoint, "id" | "lvl">;

export interface PositionOpenEvent {
  /** Unix timestamp in milliseconds. */
  t: number;

  /** Volatility point that authorized the entry. */
  vPoint: PositionVPointRef;

  /** Non-automatic entry source. Undefined means AUTO. */
  source?: PositionEntrySourceOverride;

  /** Stable machine-readable reason that opened the position. */
  reason: PositionOpenReason;

  /** Immutable diagnostic text captured when the entry executes. */
  message: string;

  /** Immutable initial execution price before any averaging. */
  price: number;
}

export interface PositionExposure {
  /** Current total base quantity or futures contract quantity. */
  quantity: number;

  /** Weighted entry price after all averaging executions. */
  averageEntryPrice: number;

  /** Current position notional, excluding leverage semantics from the name. */
  notionalUsdt: number;

  /** Margin currently assigned to the position. */
  marginUsdt: number;

  /** Futures leverage; use 1 for spot. */
  leverage: number;
}

export interface PositionFees {
  /** Entry fees, including fees from averaging executions. */
  entryUsdt: number;

  /** Estimated exit fee for an open position. Removed after closing. */
  estimatedExitUsdt?: number;
}

export type PositionReserveStepStatus =
  | "RESERVED"
  | "UNRESERVED"
  | "USED"
  | "RELEASED";

export interface PositionReserveStep {
  /** Signed volatility level that activates this step. */
  level: number;

  /** Margin required to execute the step. */
  marginUsdt: number;

  /** Allocation in percentage points. */
  allocationPct: number;

  status: PositionReserveStepStatus;

  /** Reserved margin originally assigned to a USED adaptive step. */
  reservedMarginUsdt?: number;

  /** Unix timestamp and execution price for a USED step. */
  usedAt?: number;
  usedPrice?: number;

  /** Unix timestamp when reserved margin was released. */
  releasedAt?: number;
}

export interface PositionAveragingExecution {
  t: number;
  level: number;
  marginUsdt: number;
  price: number;
  allocationPct: number;
  reservedMarginUsdt?: number;
  adaptiveMultiplier?: number;
  projectedProfitPct?: number;
}

export interface PositionAveragingState {
  /** Level at which the position originally entered. */
  entryLevel: number;

  /** Latest level consumed or deliberately skipped by averaging. */
  lastHandledLevel: number;

  /** Base margin used to calculate subsequent averaging steps. */
  reserveBaseMarginUsdt: number;

  /** Reserved margin that remains assigned to future steps. */
  reservedRemainingMarginUsdt: number;

  steps: PositionReserveStep[];
  executions?: PositionAveragingExecution[];
}

export interface PositionEntryDecision<TFeature = unknown> {
  /** Omitted only when historical migration cannot recover the engine. */
  engine?: DecisionEngineVersionType;

  /** Exact immutable feature data supplied to the decision engine. */
  feature?: TFeature;

  /** Structured label returned by the decision engine. */
  label?: string;
}

export interface PositionStrategyState<TEntryFeature = unknown> {
  entry: PositionEntryDecision<TEntryFeature>;
  averaging: PositionAveragingState;
}

export interface PositionPnlPoint {
  /** Unix timestamp in milliseconds. */
  t: number;

  /** Net, unleveraged PnL in percentage points. */
  pct: number;
}

export interface PositionPnl {
  /** Latest monitored market price. */
  markPrice?: number;

  /** Net, unleveraged PnL in percentage points. */
  netPct?: number;

  /** Net position profit or loss in USDT. */
  netUsdt?: number;

  /** Current net position value in USDT. */
  currentValueUsdt?: number;

  /** Best observed net PnL in percentage points. */
  maxUpPct?: number;

  /** Worst observed net PnL in percentage points. */
  maxDownPct?: number;

  history?: PositionPnlPoint[];
}

export interface PositionCloseEvent {
  /** Unix timestamp in milliseconds. */
  t: number;

  /** Non-automatic actor that initiated or reported the close. Undefined means AUTO. */
  source?: PositionCloseSourceOverride;

  /** Realized exit price. */
  price: number;

  /** Realized exit-side fee. */
  feeUsdt: number;

  /** Volatility point observed when exiting, when one exists. */
  vPoint?: PositionVPointRef;

  /** Stable machine-readable exit reason. */
  reason:
    | "TAKE_PROFIT"
    | "STOP_LOSS"
    | "STOP_LOSS_PLUS_TP"
    | "VOLATILITY_TARGET_TP"
    | "VOLATILITY_TARGET_SL"
    | "POST_AVERAGE_RESCUE_EXIT"
    | "POST_AVERAGE_STOP_LOSS"
    /** @deprecated Retained for existing persisted history. */
    | "POST_AVERAGE_RESCUE_TP"
    | "FINAL"
    | "LIQUIDATED"
    | "MANUAL"
    | "FORCED"
    | "UNKNOWN";

  /** Immutable diagnostic text captured when the close executes. */
  message: string;
}

export interface PositionControl {
  forceExit?: {
    reason: string;
  };
}

export type PositionMonitoringStage = "speedup" | "standard";

export interface PositionLastMonitoringStage {
  /** Latest production monitoring stage that completed successfully. */
  stage: PositionMonitoringStage;

  /** Unix timestamp in milliseconds. */
  lastUpdated: number;

  /** Human-readable snapshot explaining the persisted stage classification. */
  reason: string;
}

export interface PositionFundingSnapshot {
  /** Exchange that supplied this public funding snapshot. */
  exchange: ExchangeType;
  /** Raw decimal rate, where 0.0001 means 0.01%. */
  rate: number;
  /** Exchange snapshot timestamp in Unix milliseconds. */
  t: number;
  /** Next scheduled funding settlement in Unix milliseconds. */
  nextT?: number;
}

export interface Position<TEntryFeature = unknown> {
  symbol: string;
  executionMode: PositionExecutionMode;
  tradingMode: TradingMode;
  direction: PositionDirection;

  /** Optional user-authored note, editable for persisted history rows. */
  notes?: string;

  /** Retained after close for monitoring diagnostics in trade history. */
  lastMonitoringStage?: PositionLastMonitoringStage;

  opened: PositionOpenEvent;

  /** Ordered intermediate vPoints; excludes opened.vPoint and closed.vPoint. */
  vPoints?: PositionVPointRef[];

  exposure: PositionExposure;
  fees: PositionFees;
  strategy: PositionStrategyState<TEntryFeature>;
  pnl: PositionPnl;

  /** Latest valid funding snapshot for monitored futures positions. */
  funding?: PositionFundingSnapshot;
  control?: PositionControl;

  /** Present only after the position has closed. */
  closed?: PositionCloseEvent;
}
```

### Entry Decision Snapshot

`strategy.entry.feature` stores the computed market features supplied to the
decision engine, such as target-coin normalization, BTC context, comparative
metrics, market levels, and sensitive metrics. It does not contain averaging
state.

At execution time, persist a JSON clone of the recommendation feature:

```ts
const entryDecision: PositionEntryDecision<typeof entrySignal.feature> = {
  engine: decisionEngineVersion,
  feature: structuredClone(entrySignal.feature),
  label: entrySignal.descisionLabel,
};
```

An engine such as `decision.v20` that does not consume a computed feature
object omits `feature`, but still persists its `engine` for new entries.
Historical migration omits `engine` when the old position did not persist it.
The snapshot is immutable and is used to explain or reproduce why the engine
allowed the entry.

### Position Storage Budget

A local sample of 49 compact persisted positions produced these uncompressed
sizes:

| Data | Average | Median | Maximum |
| --- | ---: | ---: | ---: |
| Complete position | 1.96 KB | 1.67 KB | 3.99 KB |
| Decision feature | 0.15 KB | effectively empty | 0.94 KB |
| Averaging state | 0.48 KB | 0.40 KB | 0.88 KB |
| PnL history | 0.31 KB | 0.19 KB | 1.25 KB |
| Entry and exit messages | 0.28 KB | 0.28 KB | 0.45 KB |

The decision snapshot is acceptable at the current scale. A feature-based
engine costs about 0.9 KB per position, while `decision.v20` omits the feature.
The snapshot provides more value for decision audits than its current storage
cost.

Storage rules:

- Persist only computed scalar/object features actually consumed by the
  decision engine.
- Never copy raw candles, complete volatility maps, price-history arrays, or
  model-memory maps into a position.
- Omit `feature` when the selected engine does not consume one.
- Keep files as compact JSON.
- Remove human-readable time fields, but retain entry and close messages as
  immutable audit context.
- Treat PnL history retention as the first scaling control because it grows
  throughout the position lifetime, while the entry feature is written once.
- Add compressed archival storage only when measured history volume justifies
  it. Do not introduce feature deduplication or hash references prematurely.

`UnifiedPosition` owns the normalized exchange-side values and is explicitly
type-exported from the `@/lib/exchange` facade so position code does not import
exchange internals.

`DecisionEngineVersionType` owns the supported decision-engine IDs and is
explicitly type-exported from `@/lib/brain`; the position model does not
recreate its version union.

### Invariants

- A position is uniquely identified within its storage mode by `symbol` and
  `opened.vPoint.id`.
- The engine must not create more than one position for the same symbol and
  entry vPoint. When migration finds duplicate historical rows, it keeps the
  newest lifecycle record and removes the older rows before replacing storage.
  Newness is determined by `closed.t` for a closed position and otherwise by
  `opened.t`; a tie keeps the later array record.
- Do not add a synthetic position ID while that uniqueness rule holds. Add one
  only if a future workflow permits multiple positions from one entry vPoint.
- `opened` is immutable after entry.
- `strategy.entry` is an immutable snapshot of the engine, feature input, and
  resulting label used for the entry decision.
- Averaging updates `exposure`, `fees.entryUsdt`, and
  `strategy.averaging`; it does not replace `opened.vPoint`.
- For futures, `exposure.notionalUsdt` equals
  `exposure.marginUsdt * exposure.leverage`, within exchange rounding.
- `exposure.averageEntryPrice` is the weighted price of the complete current
  quantity, not the price of the first execution.
- An open position has no `closed` object. Its optional
  `fees.estimatedExitUsdt` is only a monitoring estimate.
- A closed position has `closed.feeUsdt` as the realized exit fee and must not
  retain `fees.estimatedExitUsdt`.
- `opened.source` and `closed.source` default to `AUTO` when omitted. Persist
  them only for non-automatic overrides.
- `opened.reason` and `closed.reason` are the authoritative lifecycle system
  codes.
- `closed.source` identifies the actor while `closed.reason` identifies the
  trading condition. They must remain separate.
- `opened.message` and `closed.message` are immutable audit snapshots.
  Structured fields remain authoritative and code must never parse either
  message to recover accounting or control values.
- `pnl.markPrice` is the latest monitoring price. For a closed position,
  `closed.price` is the authoritative realized exit price.
- `opened.price` is the immutable initial fill. Averaging updates
  `exposure.averageEntryPrice` but never changes `opened.price`.
- Structured fields are authoritative. Display text must never be parsed back
  into position accounting.

### Example

```json
{
  "symbol": "KITE",
  "executionMode": "sandbox",
  "tradingMode": "futures",
  "direction": "LONG",
  "opened": {
    "t": 1785352980000,
    "vPoint": {
      "id": "B_ec9_29_07_26_23_45",
      "lvl": -1
    },
    "reason": "COMMON",
    "message": "[BUY] 30_Jul_2026_02_23 - [ENTRY] [COMMON], Price: 0.09062 | Level: -1",
    "price": 0.09062
  },
  "exposure": {
    "quantity": 263,
    "averageEntryPrice": 0.09062,
    "notionalUsdt": 23.83306,
    "marginUsdt": 5.958265,
    "leverage": 4
  },
  "fees": {
    "entryUsdt": 0.023833
  },
  "strategy": {
    "entry": {
      "engine": "decision.v20"
    },
    "averaging": {
      "entryLevel": -1,
      "lastHandledLevel": -1,
      "reserveBaseMarginUsdt": 5.958265,
      "reservedRemainingMarginUsdt": 0,
      "steps": [
        {
          "level": -2,
          "marginUsdt": 11.91653,
          "allocationPct": 2,
          "status": "RELEASED",
          "releasedAt": 1785368656175
        }
      ]
    }
  },
  "pnl": {
    "markPrice": 0.09371,
    "netPct": 3.276,
    "netUsdt": 0.781,
    "currentValueUsdt": 24.614,
    "maxUpPct": 3.74,
    "maxDownPct": -0.818,
    "history": [
      {
        "t": 1785352980000,
        "pct": 0
      },
      {
        "t": 1785368640000,
        "pct": 3.276
      }
    ]
  },
  "closed": {
    "t": 1785368640000,
    "price": 0.09377,
    "feeUsdt": 0.024662,
    "vPoint": {
      "id": "B_ec9_29_07_26_23_45",
      "lvl": -1
    },
    "reason": "STOP_LOSS_PLUS_TP",
    "message": "[SELL] 30_Jul_2026_06_44 - [STOP_LOSS_PLUS_TP] Locked profit at 3.28%"
  }
}
```

## Values Not Persisted

The following values should be derived at API or presentation boundaries:

- `entryTimeHuman`
- `exitTimeHuman`
- `holdDurationTime`
- `holdDurationHuman`
- top-level `message`, moved to `opened.message`
- top-level `exitMessage`, moved to `closed.message`
- top-level `lastUpdatedAt`, replaced by the structured
  `lastMonitoringStage` diagnostic written by successful monitoring
- bracketed category labels
- total fee, calculated as `fees.entryUsdt + closed.feeUsdt` for a closed
  position

Notifications and dashboard rows may display the stored event messages or
build concise text from structured fields. Persisted prose must not become the
source of accounting truth.

## Position Migration

The position migration is a hard cutover:

1. Replace the current position types, readers, writers, execution logic,
   reporting logic, dashboard converters, and backtest code with the canonical
   structure.
2. Start the application with the trading runner stopped and preview the
   position migration with `GET /api/alter/position?dryRun=true`.
3. Run `POST /api/alter/position` with `{ "dryRun": false }` to replace the
   validated files.
4. Find every persisted open and closed position in SLOW runtime storage,
   sandbox storage, history storage, and backtest datasets.
5. Convert every record into the canonical `Position` structure.
6. Validate all converted records before replacing any source file.
7. Select only position-owning files; never select SLOW configuration, account,
   or other operational files.
8. Stage compact JSON, retain timestamped recovery backups, and atomically
   replace each validated source file.
9. Report scanned files, changed files, migrated positions, removed duplicate
   positions, byte sizes, and saved bytes.

After migration, the application reads and writes only the canonical structure.
There is no `v` field, dual schema, fallback parser, or backward-compatibility
branch. The endpoint should remain idempotent so running it again does not
damage already-migrated records.

### Current-to-Canonical Mapping

| Current key | Canonical position key |
| --- | --- |
| `entryId` | `opened.vPoint.id` |
| `entryLevel` | `opened.vPoint.lvl` |
| `entryTime` | `opened.t` |
| `entryPrice` | `exposure.averageEntryPrice` |
| `quantity` | `exposure.quantity` |
| `quantity * entryPrice` | `exposure.notionalUsdt` |
| `marginUSDT` | `exposure.marginUsdt` |
| `leverage` | `exposure.leverage` |
| `entryFeeUSDT` | `fees.entryUsdt` |
| open `exitFeeUSDT` | `fees.estimatedExitUsdt` |
| closed `exitFeeUSDT` | `closed.feeUsdt` |
| `category: "[COMMON]"` | `opened.reason: "COMMON"` and omit `opened.source` (defaults to `AUTO`) |
| `category: "[MANUAL]"` | `opened.reason: "MANUAL"` and `opened.source: "MANUAL"` |
| `category: "[BYPASS]"` | `opened.reason: "BYPASS"` and `opened.source: "BYPASS"` |
| `category: "[SHORT]"` | `direction: "SHORT"` and `opened.reason: "COMMON"` |
| missing or unrecognized entry category | `opened.reason: "UNKNOWN"` |
| `message` | `opened.message` |
| configured decision engine | `strategy.entry.engine` |
| `entryFeature` excluding `watchState` | `strategy.entry.feature` |
| `entryLabel` | `strategy.entry.label` |
| `lastUpdatedAt` | Remove; successful monitoring owns `lastMonitoringStage.lastUpdated` together with its stage and reason |
| `entryFeature.watchState` | `strategy.averaging` |
| `entryFeature.watchState.reserveSteps` | `strategy.averaging.steps` |
| `entryFeature.watchState.addPositionTriggers` | `strategy.averaging.executions` |
| `pctAlloc` | `allocationPct` |
| averaging `entryNotionalUsdt / leverage` | averaging execution `marginUsdt` |
| `netProfitPercent` | `pnl.netPct` |
| `netProfitUSDT` | `pnl.netUsdt` |
| `netCurrentUSDT` | `pnl.currentValueUsdt` |
| `markPrice` | `pnl.markPrice` |
| `maxRunUpPercent` | `pnl.maxUpPct` |
| `maxDrawdownPercent` | `pnl.maxDownPct` |
| `netProfitPercentHistory` | `pnl.history` |
| `exitId` | `closed.vPoint.id` |
| `exitLevel` | `closed.vPoint.lvl` |
| `exitTime` | `closed.t` |
| `exitPrice` | `closed.price` |
| automatic strategy exit | omit `closed.source` (defaults to `AUTO`) |
| manual dashboard exit | `closed.source: "MANUAL"` |
| exchange-side close or liquidation | `closed.source: "EXCHANGE"` |
| exit message tag | `closed.reason` |
| `exitMessage` | `closed.message` |

The migration must report records whose canonical accounting fields contradict
their message text, preserve the complete text in the appropriate lifecycle
event, then migrate using the structured fields as authoritative. It may use a
known legacy tag to select the event reason, but must never use message prose to
overwrite structured quantity, notional, margin, fee, price, or PnL values.
