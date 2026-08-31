import type {
  Position,
  PositionCloseReason,
  PositionOpenReason,
  PositionVPointRef,
} from "@/lib/trading/models";

interface TimedPositionVPointRef extends PositionVPointRef {
  t: number;
}

/** Crops and compacts the ordered vPoints strictly between entry and exit. */
function getIntermediateVPoints(params: {
  position: Pick<Position, "closed" | "opened">;
  volatilityPoints: TimedPositionVPointRef[];
}): PositionVPointRef[] | undefined {
  // BOTH:POSITION_VPOINT_PATH
  const { position } = params;
  if (!position.closed) {
    return undefined;
  }
  const closed = position.closed;

  const seenIds = new Set<string>();
  const sortedPoints = [...params.volatilityPoints]
    .filter(
      (point) =>
        typeof point.id === "string" &&
        point.id.trim().length > 0 &&
        Number.isFinite(point.t) &&
        Number.isFinite(point.lvl),
    )
    .sort((left, right) => left.t - right.t)
    .filter((point) => {
      if (seenIds.has(point.id)) {
        return false;
      }

      seenIds.add(point.id);
      return true;
    });
  const entryIndex = sortedPoints.findIndex(
    (point) => point.id === position.opened.vPoint.id,
  );
  if (entryIndex < 0) {
    return undefined;
  }

  const exitId = closed.vPoint?.id;
  const exitIndex = exitId
    ? sortedPoints.findIndex(
        (point, index) => index > entryIndex && point.id === exitId,
      )
    : -1;
  const endIndex =
    exitIndex >= 0
      ? exitIndex
      : sortedPoints.findIndex(
          (point, index) =>
            index > entryIndex && point.t > closed.t,
        );
  const boundedPoints = sortedPoints.slice(
    entryIndex + 1,
    endIndex >= 0 ? endIndex : undefined,
  );

  return boundedPoints
    .filter(
      (point) =>
        point.id !== position.opened.vPoint.id && point.id !== exitId,
    )
    .map(({ id, lvl }) => ({ id, lvl }));
}

function getIdentity(position: Pick<Position, "symbol" | "opened">): string {
  return `${position.symbol}:${position.opened.vPoint.id}`;
}

function getDurationMs(
  position: Pick<Position, "opened" | "closed">,
  now = Date.now(),
): number {
  return Math.max(0, (position.closed?.t ?? now) - position.opened.t);
}

function getTotalFeeUsdt(
  position: Pick<Position, "fees" | "closed">,
): number {
  return (
    position.fees.entryUsdt +
    (position.closed?.feeUsdt ?? position.fees.estimatedExitUsdt ?? 0)
  );
}

function getEntrySource(
  position: Pick<Position, "opened">,
): "AUTO" | NonNullable<Position["opened"]["source"]> {
  return position.opened.source ?? "AUTO";
}

function resolveOpenReason(category?: string): PositionOpenReason {
  const normalized = String(category ?? "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .trim()
    .toUpperCase();

  if (normalized.includes("BYPASS")) return "BYPASS";
  if (normalized.includes("MANUAL")) return "MANUAL";
  if (normalized.includes("COMMON") || normalized.includes("SHORT")) {
    return "COMMON";
  }
  return "UNKNOWN";
}

function getCloseSource(
  position: Pick<Position, "closed">,
): "AUTO" | NonNullable<NonNullable<Position["closed"]>["source"]> {
  return position.closed?.source ?? "AUTO";
}

function getEntryLabel(position: Pick<Position, "strategy" | "opened">) {
  return position.strategy.entry.label ?? position.opened.reason;
}

function getCloseLabel(
  position: Pick<Position, "closed">,
): PositionCloseReason | "OPEN" {
  return position.closed?.reason ?? "OPEN";
}

const position = {
  close: {
    label: getCloseLabel,
    source: getCloseSource,
  },
  duration: {
    ms: getDurationMs,
  },
  entry: {
    label: getEntryLabel,
    reason: {
      resolve: resolveOpenReason,
    },
    source: getEntrySource,
  },
  fees: {
    totalUsdt: getTotalFeeUsdt,
  },
  identity: {
    key: getIdentity,
  },
  vPoints: {
    intermediate: getIntermediateVPoints,
  },
} as const;

export default position;
