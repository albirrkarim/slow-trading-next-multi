type HistoryMode = "live" | "sandbox";

export interface TradeHistoryPagePosition {
  account?: unknown;
  closed?: { t?: unknown };
  direction?: unknown;
  opened?: { t?: unknown; vPoint?: { id?: unknown } };
  symbol?: unknown;
}

interface TradeHistorySortKey {
  account: string;
  closedAt: number;
  direction: string;
  openedAt: number;
  symbol: string;
  vPointId: string;
}

interface TradeHistoryCursorV1 {
  duplicateOffset: number;
  key: TradeHistorySortKey;
  mode: HistoryMode;
  symbol: string;
  version: 1;
}

export interface TradeHistoryPage<TPosition> {
  hasMore: boolean;
  items: TPosition[];
  nextCursor: string | null;
}

const MAX_CURSOR_LENGTH = 2_048;

function finiteTime(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sortKey(position: TradeHistoryPagePosition): TradeHistorySortKey {
  return {
    account: text(position.account),
    closedAt: finiteTime(position.closed?.t),
    direction: text(position.direction),
    openedAt: finiteTime(position.opened?.t),
    symbol: text(position.symbol).trim().toUpperCase(),
    vPointId: text(position.opened?.vPoint?.id),
  };
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareKey(left: TradeHistorySortKey, right: TradeHistorySortKey) {
  return left.openedAt - right.openedAt || left.closedAt - right.closedAt ||
    compareText(left.account, right.account) || compareText(left.symbol, right.symbol) ||
    compareText(left.vPointId, right.vPointId) || compareText(left.direction, right.direction);
}

function isSortKey(value: unknown): value is TradeHistorySortKey {
  if (!value || typeof value !== "object") return false;
  const key = value as Record<string, unknown>;
  return Number.isFinite(key.openedAt) && Number.isFinite(key.closedAt) &&
    typeof key.account === "string" && typeof key.symbol === "string" &&
    typeof key.vPointId === "string" && typeof key.direction === "string";
}

function encodeCursor(cursor: TradeHistoryCursorV1) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decodes and validates an opaque cursor against the current history filters. */
function decodeCursor(value: unknown, mode: HistoryMode, symbol: string): TradeHistoryCursorV1 | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("Trade history cursor is invalid.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TradeHistoryCursorV1>;
    if (parsed.version !== 1 || parsed.mode !== mode || parsed.symbol !== symbol ||
      !isSortKey(parsed.key) || !Number.isInteger(parsed.duplicateOffset) ||
      (parsed.duplicateOffset ?? -1) < 0) throw new Error("mismatch");
    return parsed as TradeHistoryCursorV1;
  } catch {
    throw new Error("Trade history cursor is invalid or does not match the requested mode and symbol.");
  }
}

/** Returns a newest-first seek page stable while newer trades are appended. */
function paginate<TPosition extends TradeHistoryPagePosition>(params: {
  cursor?: unknown;
  limit: number;
  mode: HistoryMode;
  positions: readonly TPosition[];
  symbol?: string;
}): TradeHistoryPage<TPosition> {
  // PROD:MCP_TRADE_HISTORY_PAGINATION
  const symbol = String(params.symbol ?? "").trim().toUpperCase();
  const cursor = decodeCursor(params.cursor, params.mode, symbol);
  const sorted = params.positions.map((position, originalOffset) => ({ duplicateOffset: 0, key: sortKey(position), originalOffset, position }))
    .sort((left, right) => compareKey(right.key, left.key) || left.originalOffset - right.originalOffset);
  let previousKey: TradeHistorySortKey | null = null;
  let duplicateOffset = 0;
  for (const item of sorted) {
    if (previousKey && compareKey(item.key, previousKey) === 0) duplicateOffset += 1;
    else duplicateOffset = 0;
    item.duplicateOffset = duplicateOffset;
    previousKey = item.key;
  }
  const eligible = cursor ? sorted.filter((item) => {
    const comparison = compareKey(item.key, cursor.key);
    return comparison < 0 || (comparison === 0 && item.duplicateOffset > cursor.duplicateOffset);
  }) : sorted;
  const pageItems = eligible.slice(0, params.limit);
  const last = pageItems.at(-1);
  const hasMore = eligible.length > pageItems.length;
  return {
    hasMore,
    items: pageItems.map((item) => item.position),
    nextCursor: hasMore && last ? encodeCursor({ duplicateOffset: last.duplicateOffset, key: last.key, mode: params.mode, symbol, version: 1 }) : null,
  };
}

const slowTradingTradeHistoryPagination = { cursor: { decode: decodeCursor }, paginate } as const;

export default slowTradingTradeHistoryPagination;
