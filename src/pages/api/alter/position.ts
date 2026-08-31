import {
  resolveLocalProjectRoot,
  resolvePersistentStorageRoot,
} from "@/lib/persistent-storage-root";
import type {
  Position,
  PositionAveragingExecution,
  PositionAveragingState,
  PositionCloseReason,
  PositionCloseSourceOverride,
  PositionEntrySourceOverride,
  PositionReserveStep,
} from "@/lib/trading/models";
import type { VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange";
import { DEFAULT_EXCHANGE_ACCOUNT_SLUG } from "@/lib/exchange/account-context";
import tradingPosition from "@/lib/trading/position";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

interface MigrationContext {
  defaultExecutionMode: Position["executionMode"];
  vPointSourcesBySymbol?: Record<string, PositionVPointSource[]>;
}

type PositionVPointSource = Array<
  Pick<VolatilityPoint, "id" | "lvl" | "t">
>;

interface MigrationResult {
  changed: boolean;
  duplicatesRemoved: number;
  positions: number;
  value: unknown;
  vPointPathsAdded: number;
}

interface PreparedFile {
  duplicatesRemoved: number;
  file: string;
  json: string;
  positions: number;
  sizeBefore: number;
  vPointPathsAdded: number;
}

interface AlterPositionFileResult {
  backupFile?: string;
  duplicatesRemoved: number;
  file: string;
  positions: number;
  sizeBefore: number;
  sizeAfter: number;
  vPointPathsAdded: number;
}

const LEGACY_POSITION_KEYS = new Set([
  "category",
  "entryFeeUSDT",
  "entryFeature",
  "entryId",
  "entryLabel",
  "entryLevel",
  "entryPrice",
  "entryTime",
  "entryTimeHuman",
  "exitFeeUSDT",
  "exitId",
  "exitLevel",
  "exitMessage",
  "exitPrice",
  "exitTime",
  "exitTimeHuman",
  "fee",
  "forceSell",
  "forceSellReason",
  "holdDurationHuman",
  "holdDurationTime",
  "id",
  "leverage",
  "lastUpdatedAt",
  "marginUSDT",
  "markPrice",
  "maxDrawdownPercent",
  "maxRunUpPercent",
  "message",
  "mode",
  "netCurrentUSDT",
  "netProfitPercent",
  "netProfitPercentHistory",
  "netProfitUSDT",
  "quantity",
  "usdt",
  "v",
]);

const POSITION_CLOSE_REASONS = new Set<PositionCloseReason>([
  "TAKE_PROFIT",
  "STOP_LOSS",
  "EXIT_ON_VPOINT_LEVEL",
  "STOP_LOSS_BY_USDT_LOSS",
  "STOP_LOSS_PLUS_TP",
  "VOLATILITY_TARGET_TP",
  "VOLATILITY_TARGET_SL",
  "POST_AVERAGE_RESCUE_EXIT",
  "POST_AVERAGE_STOP_LOSS",
  "POST_AVERAGE_RESCUE_TP",
  "LIQUIDATED",
  "MANUAL",
  "FORCED",
  "FINAL",
  "UNKNOWN",
]);
const POSITION_OPEN_REASONS = new Set<Position["opened"]["reason"]>([
  "COMMON",
  "MANUAL",
  "BYPASS",
  "UNKNOWN",
]);
const POSITION_FUNDING_EXCHANGES = new Set<
  NonNullable<Position["funding"]>["exchange"]
>(["binance", "okx", "tokocrypto"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : positiveNumber(value);
}

function compactLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.replaceAll("[", "").replaceAll("]", "").trim();
  return label || undefined;
}

function resolveTradingMode(value: unknown): TradingMode {
  const modes = new Set(Object.values(TradingMode));
  return modes.has(value as TradingMode)
    ? (value as TradingMode)
    : TradingMode.SPOT;
}

function resolveEntrySource(
  value: Record<string, unknown>,
): PositionEntrySourceOverride | undefined {
  const category = String(value.category ?? "").toUpperCase();
  if (category.includes("BYPASS")) return "BYPASS";
  if (category.includes("MANUAL")) return "MANUAL";
  return undefined;
}

function resolveCloseReason(value: Record<string, unknown>): PositionCloseReason {
  const text =
    `${String(value.exitMessage ?? "")} ${String(value.category ?? "")}`.toUpperCase();
  if (text.includes("EXIT_ON_VPOINT_LEVEL")) return "EXIT_ON_VPOINT_LEVEL";
  if (text.includes("STOP_LOSS_BY_USDT_LOSS")) {
    return "STOP_LOSS_BY_USDT_LOSS";
  }
  if (text.includes("VOLATILITY_TARGET_SL")) return "VOLATILITY_TARGET_SL";
  if (text.includes("VOLATILITY_TARGET_TP")) return "VOLATILITY_TARGET_TP";
  if (text.includes("POST_AVERAGE_RESCUE_EXIT")) {
    return "POST_AVERAGE_RESCUE_EXIT";
  }
  if (text.includes("POST_AVERAGE_RESCUE_TP")) {
    return "POST_AVERAGE_RESCUE_TP";
  }
  if (text.includes("STOP_LOSS_PLUS")) return "STOP_LOSS_PLUS_TP";
  if (text.includes("TAKE_PROFIT")) return "TAKE_PROFIT";
  if (text.includes("STOP_LOSS")) return "STOP_LOSS";
  if (text.includes("LIQUIDAT")) return "LIQUIDATED";
  if (text.includes("FINAL")) return "FINAL";
  if (text.includes("MANUAL")) return "MANUAL";
  if (text.includes("FORCE")) return "FORCED";
  return "UNKNOWN";
}

function resolveCloseSource(
  value: Record<string, unknown>,
): PositionCloseSourceOverride | undefined {
  const text = String(value.exitMessage ?? "").toUpperCase();
  if (text.includes("CLOSED_ON_EXCHANGE")) return "EXCHANGE";
  if (text.includes("MANUAL")) return "MANUAL";
  return undefined;
}

function isLegacyPosition(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.symbol === "string" &&
    typeof value.entryId === "string" &&
    positiveNumber(value.entryTime) !== undefined &&
    positiveNumber(value.entryPrice) !== undefined &&
    positiveNumber(value.quantity) !== undefined
  );
}

function isCompactPositionVPointRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "id" || key === "lvl") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    finiteNumber(value.lvl) !== undefined
  );
}

export function isCanonicalPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.symbol === "string" &&
    (value.executionMode === "live" || value.executionMode === "sandbox") &&
    Object.values(TradingMode).includes(value.tradingMode as TradingMode) &&
    (value.direction === "LONG" || value.direction === "SHORT") &&
    isRecord(value.opened) &&
    positiveNumber(value.opened.t) !== undefined &&
    isRecord(value.opened.vPoint) &&
    typeof value.opened.vPoint.id === "string" &&
    finiteNumber(value.opened.vPoint.lvl) !== undefined &&
    POSITION_OPEN_REASONS.has(
      value.opened.reason as Position["opened"]["reason"],
    ) &&
    typeof value.opened.message === "string" &&
    positiveNumber(value.opened.price) !== undefined &&
    isRecord(value.exposure) &&
    positiveNumber(value.exposure.quantity) !== undefined &&
    positiveNumber(value.exposure.averageEntryPrice) !== undefined &&
    positiveNumber(value.exposure.notionalUsdt) !== undefined &&
    positiveNumber(value.exposure.marginUsdt) !== undefined &&
    positiveNumber(value.exposure.leverage) !== undefined &&
    isRecord(value.fees) &&
    finiteNumber(value.fees.entryUsdt) !== undefined &&
    Number(value.fees.entryUsdt) >= 0 &&
    isRecord(value.strategy) &&
    isRecord(value.strategy.entry) &&
    isRecord(value.strategy.averaging) &&
    isRecord(value.pnl)
  );
}

function migrateReserveStep(value: unknown): PositionReserveStep | undefined {
  if (!isRecord(value)) return undefined;
  const level = finiteNumber(value.level);
  const marginUsdt = positiveNumber(value.marginUsdt);
  const allocationPct = positiveNumber(value.allocationPct ?? value.pctAlloc);
  const allowedStatuses = new Set([
    "RESERVED",
    "UNRESERVED",
    "USED",
    "RELEASED",
  ]);
  if (
    level === undefined ||
    marginUsdt === undefined ||
    allocationPct === undefined ||
    !allowedStatuses.has(String(value.status))
  ) {
    return undefined;
  }

  return {
    level,
    marginUsdt,
    allocationPct,
    status: value.status as PositionReserveStep["status"],
    reservedMarginUsdt: optionalPositiveNumber(value.reservedMarginUsdt),
    usedAt: finiteNumber(value.usedAt),
    usedPrice: optionalPositiveNumber(value.usedPrice),
    releasedAt: finiteNumber(value.releasedAt),
  };
}

function migrateAveragingExecution(
  value: unknown,
  leverage: number,
): PositionAveragingExecution | undefined {
  if (!isRecord(value)) return undefined;
  const t = finiteNumber(value.t ?? value.time);
  const level = finiteNumber(value.level ?? value.handledLevel);
  const explicitMarginUsdt = positiveNumber(
    value.marginUsdt ?? value.entryMarginUsdt,
  );
  const legacyNotionalUsdt = positiveNumber(value.entryNotionalUsdt);
  const marginUsdt =
    explicitMarginUsdt ??
    (legacyNotionalUsdt !== undefined
      ? legacyNotionalUsdt / leverage
      : undefined);
  const price = positiveNumber(value.price);
  const allocationPct = positiveNumber(
    value.allocationPct ?? value.pctAlloc,
  );
  if (
    t === undefined ||
    level === undefined ||
    marginUsdt === undefined ||
    price === undefined ||
    allocationPct === undefined
  ) {
    return undefined;
  }

  return {
    t,
    level,
    marginUsdt,
    price,
    allocationPct,
    reservedMarginUsdt: optionalPositiveNumber(value.reservedMarginUsdt),
    adaptiveMultiplier: optionalPositiveNumber(
      value.adaptiveMultiplier ?? value.adaptiveAveragingMultiplier,
    ),
    projectedProfitPct: finiteNumber(
      value.projectedProfitPct ??
        value.adaptiveAveragingProjectedProfitPct,
    ),
  };
}

function migrateAveraging(
  value: Record<string, unknown>,
  entryLevel: number,
  marginUsdt: number,
  leverage: number,
): PositionAveragingState {
  const entryFeature = isRecord(value.entryFeature)
    ? value.entryFeature
    : undefined;
  const watch = isRecord(entryFeature?.watchState)
    ? entryFeature.watchState
    : undefined;
  const rawSteps = Array.isArray(watch?.reserveSteps)
    ? watch.reserveSteps
    : [];
  const steps = rawSteps.map(migrateReserveStep).filter(Boolean) as
    PositionReserveStep[];
  const rawExecutions = Array.isArray(watch?.addPositionTriggers)
    ? watch.addPositionTriggers
    : [];
  const executions = rawExecutions
    .map((execution) => migrateAveragingExecution(execution, leverage))
    .filter(Boolean) as PositionAveragingExecution[];

  return {
    entryLevel: finiteNumber(watch?.entryLevel) ?? entryLevel,
    lastHandledLevel:
      finiteNumber(watch?.lastHandledLevel) ?? entryLevel,
    reserveBaseMarginUsdt:
      positiveNumber(watch?.reserveBaseMarginUsdt) ?? marginUsdt,
    reservedRemainingMarginUsdt:
      finiteNumber(watch?.reservedRemainingUsdt) ?? 0,
    steps,
    executions: executions.length > 0 ? executions : undefined,
  };
}

function migrateFeature(value: Record<string, unknown>): unknown {
  if (!isRecord(value.entryFeature)) return undefined;
  const { watchState: _watchState, ...feature } = value.entryFeature;
  return Object.keys(feature).length > 0 ? feature : undefined;
}

/** Converts one legacy flat position to the canonical persisted structure. */
export function migrateLegacyPosition(
  value: Record<string, unknown>,
  context: MigrationContext,
): Position {
  const entryPrice = positiveNumber(value.entryPrice)!;
  const quantity = positiveNumber(value.quantity)!;
  const leverage = positiveNumber(value.leverage) ?? 1;
  const calculatedNotional = entryPrice * quantity;
  const notionalUsdt = calculatedNotional;
  const marginUsdt =
    positiveNumber(value.marginUSDT) ?? notionalUsdt / leverage;
  const entryLevel = finiteNumber(value.entryLevel) ?? 0;
  const exitFeeUsdt = finiteNumber(value.exitFeeUSDT) ?? 0;
  const totalFeeUsdt = finiteNumber(value.fee);
  const entryFeeUsdt =
    finiteNumber(value.entryFeeUSDT) ??
    Math.max(0, (totalFeeUsdt ?? 0) - exitFeeUsdt);
  const hasClose = positiveNumber(value.exitTime) !== undefined;
  const label = compactLabel(value.entryLabel ?? value.category);
  const mode =
    value.executionMode === "live" || value.executionMode === "sandbox"
      ? value.executionMode
      : value.mode === "live" || value.mode === "sandbox"
        ? value.mode
        : context.defaultExecutionMode;

  const position: Position = {
    account: String(value.account ?? DEFAULT_EXCHANGE_ACCOUNT_SLUG),
    symbol: String(value.symbol),
    executionMode: mode,
    tradingMode: resolveTradingMode(value.tradingMode),
    direction: value.direction === "SHORT" ? "SHORT" : "LONG",
    notes:
      typeof value.notes === "string" && value.notes.trim()
        ? value.notes.trim()
        : undefined,
    opened: {
      t: Number(value.entryTime),
      vPoint: {
        id: String(value.entryId),
        lvl: entryLevel,
      },
      source: resolveEntrySource(value),
      reason: tradingPosition.entry.reason.resolve(
        String(value.category ?? ""),
      ),
      message: String(value.message ?? ""),
      price: entryPrice,
    },
    exposure: {
      quantity,
      averageEntryPrice: entryPrice,
      notionalUsdt,
      marginUsdt,
      leverage,
    },
    fees: {
      entryUsdt: entryFeeUsdt,
      estimatedExitUsdt: hasClose
        ? undefined
        : Math.max(0, (totalFeeUsdt ?? entryFeeUsdt) - entryFeeUsdt),
    },
    strategy: {
      entry: {
        feature: migrateFeature(value),
        label,
      },
      averaging: migrateAveraging(
        value,
        entryLevel,
        marginUsdt,
        leverage,
      ),
    },
    pnl: {
      markPrice: optionalPositiveNumber(value.markPrice),
      netPct: finiteNumber(value.netProfitPercent),
      netUsdt: finiteNumber(value.netProfitUSDT),
      currentValueUsdt: finiteNumber(value.netCurrentUSDT),
      maxUpPct: finiteNumber(value.maxRunUpPercent),
      maxDownPct: finiteNumber(value.maxDrawdownPercent),
      history: Array.isArray(value.netProfitPercentHistory)
        ? value.netProfitPercentHistory
            .filter(isRecord)
            .map((point) => ({
              t: Number(point.t),
              pct: Number(point.pct),
            }))
            .filter(
              (point) =>
                Number.isFinite(point.t) && Number.isFinite(point.pct),
            )
        : undefined,
    },
  };

  if (value.forceSell === true || typeof value.forceSellReason === "string") {
    position.control = {
      forceExit: {
        reason: String(value.forceSellReason ?? "FORCE_SELL"),
      },
    };
  }

  if (hasClose) {
    const exitLevel = finiteNumber(value.exitLevel);
    position.closed = {
      t: Number(value.exitTime),
      source: resolveCloseSource(value),
      price: positiveNumber(value.exitPrice) ?? entryPrice,
      feeUsdt: exitFeeUsdt,
      vPoint:
        typeof value.exitId === "string" && exitLevel !== undefined
          ? { id: value.exitId, lvl: exitLevel }
          : undefined,
      reason: resolveCloseReason(value),
      message: String(value.exitMessage ?? ""),
    };
    delete position.fees.estimatedExitUsdt;
  }

  return position;
}

/**
 * Reconstructs the initial fill by removing recorded averaging fills from the
 * current weighted exposure.
 */
function reconstructOpenedPrice(value: Record<string, unknown>) {
  if (!isRecord(value.opened) || !isRecord(value.exposure)) {
    return undefined;
  }

  const existingPrice = positiveNumber(value.opened.price);
  if (existingPrice !== undefined) {
    return existingPrice;
  }

  const quantity = positiveNumber(value.exposure.quantity);
  const averageEntryPrice = positiveNumber(value.exposure.averageEntryPrice);
  const leverage = positiveNumber(value.exposure.leverage);
  if (
    quantity === undefined ||
    averageEntryPrice === undefined ||
    leverage === undefined
  ) {
    return undefined;
  }

  let initialQuantity = quantity;
  let initialCost = averageEntryPrice * quantity;
  const averaging = isRecord(value.strategy)
    ? value.strategy.averaging
    : undefined;
  const executions =
    isRecord(averaging) && Array.isArray(averaging.executions)
      ? averaging.executions
      : [];

  for (const execution of executions) {
    if (!isRecord(execution)) {
      return undefined;
    }
    const marginUsdt = positiveNumber(execution.marginUsdt);
    const price = positiveNumber(execution.price);
    if (marginUsdt === undefined || price === undefined) {
      return undefined;
    }

    const addedQuantity = (marginUsdt * leverage) / price;
    initialQuantity -= addedQuantity;
    initialCost -= addedQuantity * price;
  }

  const reconstructedPrice = initialCost / initialQuantity;
  return positiveNumber(reconstructedPrice) ?? averageEntryPrice;
}

/** Removes obsolete metadata from an otherwise canonical position. */
function removeDeprecatedCanonicalPositionKeys(position: Position): {
  changed: boolean;
  position: Position;
} {
  const record = position as Position & Record<string, unknown>;
  if (!Object.hasOwn(record, "lastUpdatedAt")) {
    return { changed: false, position };
  }

  const { lastUpdatedAt: _lastUpdatedAt, ...canonical } = record;
  return { changed: true, position: canonical as Position };
}

/** Adds opened.price to the immediately preceding canonical storage shape. */
function migrateCanonicalOpenedPrice(value: unknown): Position | null {
  if (
    !isRecord(value) ||
    !isRecord(value.opened) ||
    positiveNumber(value.opened.price) !== undefined
  ) {
    return null;
  }

  const price = reconstructOpenedPrice(value);
  if (price === undefined) {
    return null;
  }

  const migrated = {
    ...value,
    opened: {
      ...value.opened,
      price,
    },
  };

  return isCanonicalPosition(migrated)
    ? removeDeprecatedCanonicalPositionKeys(migrated).position
    : null;
}

/** Validates the required canonical position invariants. */
export function validateCanonicalPosition(
  value: unknown,
  location = "position",
): asserts value is Position {
  if (!isCanonicalPosition(value)) {
    throw new Error(`${location} is not a canonical position`);
  }
  if (!value.opened.vPoint.id.trim()) {
    throw new Error(`${location}.opened.vPoint.id is empty`);
  }
  if (
    value.opened.source !== undefined &&
    value.opened.source !== "MANUAL" &&
    value.opened.source !== "BYPASS"
  ) {
    throw new Error(`${location}.opened.source is invalid`);
  }
  if (
    !POSITION_OPEN_REASONS.has(value.opened.reason) ||
    typeof value.opened.message !== "string"
  ) {
    throw new Error(`${location}.opened event is invalid`);
  }
  const legacyKey = Object.keys(value).find((key) =>
    LEGACY_POSITION_KEYS.has(key),
  );
  if (legacyKey) {
    throw new Error(`${location} still contains legacy key ${legacyKey}`);
  }
  const averaging = value.strategy.averaging;
  if (
    !Number.isFinite(averaging.entryLevel) ||
    !Number.isFinite(averaging.lastHandledLevel) ||
    !Number.isFinite(averaging.reserveBaseMarginUsdt) ||
    averaging.reserveBaseMarginUsdt <= 0 ||
    !Number.isFinite(averaging.reservedRemainingMarginUsdt) ||
    averaging.reservedRemainingMarginUsdt < 0
  ) {
    throw new Error(`${location}.strategy.averaging is invalid`);
  }
  if (
    !Array.isArray(value.strategy.averaging.steps) ||
    value.strategy.averaging.steps.some((step) => !migrateReserveStep(step))
  ) {
    throw new Error(`${location}.strategy.averaging.steps is invalid`);
  }
  if (
    averaging.executions !== undefined &&
    (!Array.isArray(averaging.executions) ||
      averaging.executions.some(
        (execution) => !migrateAveragingExecution(
          execution,
          value.exposure.leverage,
        ),
      ))
  ) {
    throw new Error(`${location}.strategy.averaging.executions is invalid`);
  }
  const pnlNumbers = [
    value.pnl.markPrice,
    value.pnl.netPct,
    value.pnl.netUsdt,
    value.pnl.currentValueUsdt,
    value.pnl.maxUpPct,
    value.pnl.maxDownPct,
  ].filter((number) => number !== undefined);
  if (
    pnlNumbers.some((number) => !Number.isFinite(number)) ||
    (value.pnl.history !== undefined &&
      (!Array.isArray(value.pnl.history) ||
        value.pnl.history.some(
          (point) =>
            !isRecord(point) ||
            finiteNumber(point.t) === undefined ||
            finiteNumber(point.pct) === undefined,
        )))
  ) {
    throw new Error(`${location}.pnl is invalid`);
  }
  if (
    value.funding !== undefined &&
    (!isRecord(value.funding) ||
      !POSITION_FUNDING_EXCHANGES.has(
        value.funding.exchange as NonNullable<
          Position["funding"]
        >["exchange"],
      ) ||
      finiteNumber(value.funding.rate) === undefined ||
      !positiveNumber(value.funding.t) ||
      (value.funding.nextT !== undefined &&
        !positiveNumber(value.funding.nextT)))
  ) {
    throw new Error(`${location}.funding is invalid`);
  }
  if (
    value.vPoints !== undefined &&
    (!Array.isArray(value.vPoints) ||
      value.vPoints.some((point) => !isCompactPositionVPointRef(point)))
  ) {
    throw new Error(`${location}.vPoints is invalid`);
  }
  if (value.closed) {
    if (
      !positiveNumber(value.closed.t) ||
      !positiveNumber(value.closed.price) ||
      finiteNumber(value.closed.feeUsdt) === undefined ||
      value.closed.feeUsdt < 0 ||
      !POSITION_CLOSE_REASONS.has(value.closed.reason) ||
      typeof value.closed.message !== "string"
    ) {
      throw new Error(`${location}.closed is invalid`);
    }
    if (
      value.closed.source !== undefined &&
      value.closed.source !== "MANUAL" &&
      value.closed.source !== "EXCHANGE"
    ) {
      throw new Error(`${location}.closed.source is invalid`);
    }
    if (value.closed.t < value.opened.t) {
      throw new Error(`${location}.closed.t precedes opened.t`);
    }
  }
}

/** Adds a recoverable compact intermediate-vPoint path to one closed position. */
function addIntermediateVPointPath(
  position: Position,
  context: MigrationContext,
): { changed: boolean; position: Position } {
  if (!position.closed || position.vPoints !== undefined) {
    return { changed: false, position };
  }

  const symbol = position.symbol.trim().toUpperCase().replace(/_USDT$/, "");
  const sources = context.vPointSourcesBySymbol?.[symbol] ?? [];
  const source = sources.find((points) =>
    points.some((point) => point.id === position.opened.vPoint.id),
  );
  if (!source) {
    return { changed: false, position };
  }

  const vPoints = tradingPosition.vPoints.intermediate({
    position,
    volatilityPoints: source,
  });
  if (vPoints === undefined) {
    return { changed: false, position };
  }

  return {
    changed: true,
    position: { ...position, vPoints },
  };
}

function migrateNode(
  value: unknown,
  context: MigrationContext,
  location: string,
): MigrationResult {
  if (isCanonicalPosition(value)) {
    const withoutDeprecatedKeys = removeDeprecatedCanonicalPositionKeys(value);
    validateCanonicalPosition(withoutDeprecatedKeys.position, location);
    const withVPoints = addIntermediateVPointPath(
      withoutDeprecatedKeys.position,
      context,
    );
    return {
      changed: withoutDeprecatedKeys.changed || withVPoints.changed,
      duplicatesRemoved: 0,
      positions: 1,
      value: withVPoints.position,
      vPointPathsAdded: withVPoints.changed ? 1 : 0,
    };
  }

  const canonicalWithOpenedPrice = migrateCanonicalOpenedPrice(value);
  if (canonicalWithOpenedPrice) {
    validateCanonicalPosition(canonicalWithOpenedPrice, location);
    const withVPoints = addIntermediateVPointPath(
      canonicalWithOpenedPrice,
      context,
    );
    return {
      changed: true,
      duplicatesRemoved: 0,
      positions: 1,
      value: withVPoints.position,
      vPointPathsAdded: withVPoints.changed ? 1 : 0,
    };
  }

  if (isLegacyPosition(value)) {
    const position = migrateLegacyPosition(value, context);
    validateCanonicalPosition(position, location);
    const withVPoints = addIntermediateVPointPath(position, context);
    return {
      changed: true,
      duplicatesRemoved: 0,
      positions: 1,
      value: withVPoints.position,
      vPointPathsAdded: withVPoints.changed ? 1 : 0,
    };
  }

  if (Array.isArray(value)) {
    let changed = false;
    let duplicatesRemoved = 0;
    let positions = 0;
    let vPointPathsAdded = 0;
    const migrated = value.map((item, index) => {
      const result = migrateNode(
        item,
        context,
        `${location}[${index}]`,
      );
      changed ||= result.changed;
      duplicatesRemoved += result.duplicatesRemoved;
      positions += result.positions;
      vPointPathsAdded += result.vPointPathsAdded;
      return result.value;
    });
    const newestIndexByIdentity = new Map<string, number>();
    const removedIndices = new Set<number>();
    migrated.forEach((item, index) => {
      if (!isCanonicalPosition(item)) return;
      const identity = [
        item.executionMode,
        item.symbol.toUpperCase(),
        item.opened.vPoint.id,
      ].join(":");
      const previousIndex = newestIndexByIdentity.get(identity);
      if (previousIndex === undefined) {
        newestIndexByIdentity.set(identity, index);
        return;
      }

      const previous = migrated[previousIndex] as Position;
      const previousLifecycleTime = previous.closed?.t ?? previous.opened.t;
      const currentLifecycleTime = item.closed?.t ?? item.opened.t;
      const removeIndex =
        currentLifecycleTime >= previousLifecycleTime ? previousIndex : index;

      removedIndices.add(removeIndex);
      if (removeIndex === previousIndex) {
        newestIndexByIdentity.set(identity, index);
      }
      changed = true;
      duplicatesRemoved += 1;
      positions -= 1;
    });
    return {
      changed,
      duplicatesRemoved,
      positions,
      value: migrated.filter((_, index) => !removedIndices.has(index)),
      vPointPathsAdded,
    };
  }

  if (isRecord(value)) {
    let changed = false;
    let duplicatesRemoved = 0;
    let positions = 0;
    let vPointPathsAdded = 0;
    const migrated = Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const childContext =
          key === "live" || key === "sandbox"
            ? {
                ...context,
                defaultExecutionMode:
                  key as Position["executionMode"],
              }
            : context;
        const result = migrateNode(
          item,
          childContext,
          `${location}.${key}`,
        );
        changed ||= result.changed;
        duplicatesRemoved += result.duplicatesRemoved;
        positions += result.positions;
        vPointPathsAdded += result.vPointPathsAdded;
        return [key, result.value];
      }),
    );
    return {
      changed,
      duplicatesRemoved,
      positions,
      value: migrated,
      vPointPathsAdded,
    };
  }

  return {
    changed: false,
    duplicatesRemoved: 0,
    positions: 0,
    value,
    vPointPathsAdded: 0,
  };
}

/** Recursively migrates positions in memory, history, and backtest snapshots. */
export function migratePositionJson(
  value: unknown,
  context: MigrationContext = { defaultExecutionMode: "sandbox" },
): MigrationResult {
  return migrateNode(value, context, "$");
}

async function listJsonFiles(root: string): Promise<string[]> {
  if (!(await fs.pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

function isWithinRoot(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith(`..${path.sep}`);
}

/**
 * Limits migration writes to files that own persisted position records.
 * Configuration and account files are deliberately outside this boundary.
 */
export function isPositionMigrationFile(
  file: string,
  roots: {
    backtest: string;
    slow: string;
  },
): boolean {
  if (isWithinRoot(file, roots.backtest)) {
    return path.basename(file) !== "config.json";
  }

  if (!isWithinRoot(file, roots.slow)) {
    return false;
  }

  const relative = path.relative(roots.slow, file);
  const segments = relative.split(path.sep);
  return (
    relative === "memory.json" ||
    relative === "state.json" ||
    segments.includes("history")
  );
}

function executionModeForFile(file: string): Position["executionMode"] {
  const normalized = file.split(path.sep).join("/");
  return normalized.includes("/live/") ? "live" : "sandbox";
}

function readPositionVPointSource(value: unknown): PositionVPointSource | undefined {
  const rawPoints = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.lastVolatility)
      ? value.lastVolatility
      : undefined;
  if (!rawPoints) {
    return undefined;
  }

  const points = rawPoints
    .filter(isRecord)
    .map((point) => ({
      id: typeof point.id === "string" ? point.id : "",
      lvl: Number(point.lvl),
      t: Number(point.t),
    }))
    .filter(
      (point) =>
        point.id.length > 0 &&
        Number.isFinite(point.lvl) &&
        Number.isFinite(point.t),
    );

  return points.length > 0 ? points : undefined;
}

function addPositionVPointSource(
  target: Record<string, PositionVPointSource[]>,
  symbol: string,
  source: PositionVPointSource | undefined,
) {
  const normalizedSymbol = symbol.trim().toUpperCase().replace(/_USDT$/, "");
  if (!normalizedSymbol || !source) {
    return;
  }

  target[normalizedSymbol] ??= [];
  target[normalizedSymbol].push(source);
}

/** Finds volatility sources embedded in backtest and model-memory JSON. */
function collectEmbeddedVPointSources(
  value: unknown,
): Record<string, PositionVPointSource[]> {
  const sources: Record<string, PositionVPointSource[]> = {};

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) {
      return;
    }

    if (typeof node.symbol === "string") {
      addPositionVPointSource(
        sources,
        node.symbol,
        readPositionVPointSource(node),
      );
    }
    Object.values(node).forEach(visit);
  };

  visit(value);
  return sources;
}

function mergePositionVPointSources(
  ...sourceMaps: Array<Record<string, PositionVPointSource[]>>
) {
  const merged: Record<string, PositionVPointSource[]> = {};
  for (const sourceMap of sourceMaps) {
    for (const [symbol, sources] of Object.entries(sourceMap)) {
      merged[symbol] ??= [];
      merged[symbol].push(...sources);
    }
  }
  return merged;
}

/** Loads persisted exchange vPoint files for position-history backfill. */
async function loadPersistedVPointSources(
  slowRoot: string,
): Promise<Record<string, PositionVPointSource[]>> {
  const config = await fs.readJSON(path.join(slowRoot, "config.json")).catch(
    () => ({}),
  );
  const configuredExchange = isRecord(config) && isRecord(config.config)
    ? String(config.config.exchangeType ?? "")
    : "";
  const exchangeEntries = await fs
    .readdir(slowRoot, { withFileTypes: true })
    .catch(() => []);
  const exchangeNames = exchangeEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "live" && name !== "sandbox")
    .sort((left, right) => {
      if (left === configuredExchange) return -1;
      if (right === configuredExchange) return 1;
      return left.localeCompare(right);
    });
  const sources: Record<string, PositionVPointSource[]> = {};

  for (const exchangeName of exchangeNames) {
    const volatilityRoot = path.join(slowRoot, exchangeName, "volatility");
    const files = await fs.readdir(volatilityRoot).catch(() => []);
    for (const name of files.filter((file) => file.endsWith(".json"))) {
      const value = await fs.readJSON(path.join(volatilityRoot, name)).catch(
        () => undefined,
      );
      const symbol = isRecord(value) && typeof value.symbol === "string"
        ? value.symbol
        : path.basename(name, ".json");
      addPositionVPointSource(
        sources,
        symbol,
        readPositionVPointSource(value),
      );
    }
  }

  return sources;
}

async function prepareFiles(
  files: string[],
  persistedVPointSources: Record<string, PositionVPointSource[]>,
): Promise<PreparedFile[]> {
  const prepared: PreparedFile[] = [];
  for (const file of files) {
    const current = await fs.readJSON(file);
    const vPointSourcesBySymbol = mergePositionVPointSources(
      collectEmbeddedVPointSources(current),
      persistedVPointSources,
    );
    const migrated = migratePositionJson(current, {
      defaultExecutionMode: executionModeForFile(file),
      vPointSourcesBySymbol,
    });
    if (!migrated.changed) continue;
    prepared.push({
      duplicatesRemoved: migrated.duplicatesRemoved,
      file,
      json: JSON.stringify(migrated.value),
      positions: migrated.positions,
      sizeBefore: (await fs.stat(file)).size,
      vPointPathsAdded: migrated.vPointPathsAdded,
    });
  }
  return prepared;
}

async function replacePreparedFiles(
  prepared: PreparedFile[],
): Promise<Map<string, string>> {
  const migrationId = Date.now().toString(36);
  const staged: Array<{ backup: string; file: string; temporary: string }> = [];
  try {
    for (const item of prepared) {
      const temporary = `${item.file}.position-alter.tmp`;
      const backup = `${item.file}.position-alter.${migrationId}.bak`;
      staged.push({ backup, file: item.file, temporary });
      await fs.writeFile(temporary, item.json);
      await fs.copy(item.file, backup, { overwrite: false });
    }

    for (const item of staged) {
      await fs.rename(item.temporary, item.file);
    }

    return new Map(staged.map((item) => [item.file, item.backup]));
  } catch (error) {
    for (const item of staged.reverse()) {
      if (await fs.pathExists(item.backup)) {
        await fs.copy(item.backup, item.file, { overwrite: true });
      }
      await fs.remove(item.temporary);
    }
    throw error;
  }
}

function pickBooleanParam(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

async function getPositionRoots(): Promise<{
  backtest: string;
  slow: string;
}> {
  const projectRoot = resolveLocalProjectRoot();
  return {
    slow: path.join(resolvePersistentStorageRoot(), "slow"),
    backtest: path.join(
      projectRoot,
      "storage/datasets/UI_TEMP/BACKTEST_DYNAMIC",
    ),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end();
    return;
  }

  try {
    const params = req.method === "GET" ? req.query : req.body;
    const dryRun = pickBooleanParam(params.dryRun);
    const roots = await getPositionRoots();
    const files = (
      await Promise.all(Object.values(roots).map((root) => listJsonFiles(root)))
    )
      .flat()
      .filter((file) => isPositionMigrationFile(file, roots));
    const persistedVPointSources = await loadPersistedVPointSources(roots.slow);
    const prepared = await prepareFiles(files, persistedVPointSources);
    let backupFiles = new Map<string, string>();

    if (!dryRun) {
      backupFiles = await replacePreparedFiles(prepared);
    }

    const results: AlterPositionFileResult[] = prepared.map((item) => ({
      backupFile: backupFiles.get(item.file),
      duplicatesRemoved: item.duplicatesRemoved,
      file: item.file,
      positions: item.positions,
      sizeBefore: item.sizeBefore,
      sizeAfter: Buffer.byteLength(item.json),
      vPointPathsAdded: item.vPointPathsAdded,
    }));
    const sizeBefore = results.reduce(
      (total, item) => total + item.sizeBefore,
      0,
    );
    const sizeAfter = results.reduce(
      (total, item) => total + item.sizeAfter,
      0,
    );

    res.json({
      dryRun,
      roots,
      scannedFiles: files.length,
      changedFiles: results.length,
      migratedPositions: results.reduce(
        (total, item) => total + item.positions,
        0,
      ),
      duplicatesRemoved: results.reduce(
        (total, item) => total + item.duplicatesRemoved,
        0,
      ),
      vPointPathsAdded: results.reduce(
        (total, item) => total + item.vPointPathsAdded,
        0,
      ),
      sizeBefore,
      sizeAfter,
      savedBytes: sizeBefore - sizeAfter,
      results,
    });
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : String(error),
      message: "No source files were replaced.",
    });
  }
}
