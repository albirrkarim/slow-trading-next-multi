import type { Position } from "@/lib/trading/models";

interface EntryOpenPositionGuardResult {
  blocked: boolean;
  currentOpenPositions: number;
  maxOpenPositions: number;
  reason?: string;
}

/** Resolves the configured maximum to a non-negative integer. */
function resolveMaxOpenPositions(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

/** Counts positions that have not been closed. */
function countOpenPositions(positions: Position[]): number {
  return positions.filter((position) => !position.closed).length;
}

/** Evaluates whether a new position would exceed the configured portfolio cap. */
function evaluate(params: {
  maxOpenPositions?: number;
  positions: Position[];
}): EntryOpenPositionGuardResult {
  const maxOpenPositions = resolveMaxOpenPositions(params.maxOpenPositions);
  const currentOpenPositions = countOpenPositions(params.positions);
  const blocked =
    maxOpenPositions > 0 && currentOpenPositions >= maxOpenPositions;

  return {
    blocked,
    currentOpenPositions,
    maxOpenPositions,
    reason: blocked
      ? `[MAX_OPEN_POSITIONS_ENTRY_GUARD] Entry skipped because ${currentOpenPositions} of ${maxOpenPositions} allowed positions are already open`
      : undefined,
  };
}

const entryOpenPositionGuard = {
  count: {
    open: countOpenPositions,
  },
  evaluate,
  limit: {
    resolve: resolveMaxOpenPositions,
  },
} as const;

export default entryOpenPositionGuard;
