import type { TradingModelMemory } from "@/lib/trading/models";
import fs from "fs-extra";
import { clone, normalizeSymbol } from "./common";
import {
  getModeHistoryRoot,
  hydrateSlowTradingHistoryFromFiles,
  readHistoryFile,
  writeHistoryFile,
} from "./history-files";
import { getActiveSlowTradingMode } from "./mode";
import {
  loadSlowTradingStorage,
  saveSlowTradingStorage,
} from "./persistence";
import type {
  SlowTradingHistoryPosition,
  SlowTradingMode,
  SlowTradingStorageData,
} from "../types";

/**
 * Handles the history position matches SLOW flow from input through output.
 */
function historyPositionMatches(
  position: SlowTradingHistoryPosition,
  target: {
    account?: string;
    entryId?: string;
    entryTime?: number;
    exitTime?: number;
    quantity?: number;
    symbol: string;
    usdt?: number;
  },
): boolean {
  // A. Symbol must always match before checking optional identity fields.
  if (target.account && position.account !== target.account) return false;
  const sameSymbol =
    normalizeSymbol(position.symbol) === normalizeSymbol(target.symbol);
  if (!sameSymbol) {
    return false;
  }

  // B. Prefer exact entry identity when the caller provides it.
  if (
    typeof target.entryId === "string" &&
    target.entryId.trim().length > 0 &&
    String(position.opened.vPoint.id || "") !== target.entryId
  ) {
    return false;
  }

  // C. Fall back to timestamp and numeric identity for older history rows.
  if (
    typeof target.entryTime === "number" &&
    Number(position.opened.t ?? NaN) !== target.entryTime
  ) {
    return false;
  }

  if (
    typeof target.exitTime === "number" &&
    Number(position.closed?.t ?? NaN) !== target.exitTime
  ) {
    return false;
  }

  if (
    typeof target.quantity === "number" &&
    Math.abs(Number(position.exposure.quantity ?? 0) - target.quantity) > 1e-9
  ) {
    return false;
  }

  if (
    typeof target.usdt === "number" &&
    Math.abs(Number(position.exposure.notionalUsdt ?? 0) - target.usdt) > 1e-9
  ) {
    return false;
  }

  return true;
}

/**
 * Delete all closed trade history entries for one slow-trading mode.
 *
 * @param mode - Mode whose closed history should be cleared.
 * @returns Updated storage and number of deleted items.
 */
export async function clearSlowTradingHistory(
  mode: SlowTradingMode,
): Promise<{ deletedCount: number; storage: SlowTradingStorageData }> {
  const storage = await loadSlowTradingStorage({ includeHistory: true });
  const modeState = storage.modes[mode];

  let deletedCount = 0;
  for (const tradeSetting of modeState.tradeSettings) {
    deletedCount += tradeSetting.model_memory.positionsSell?.length ?? 0;
    tradeSetting.model_memory.positionsSell = [];
  }

  await fs.remove(getModeHistoryRoot(mode));
  delete modeState.dailyPnlLimitState;
  await saveSlowTradingStorage(storage);
  await hydrateSlowTradingHistoryFromFiles(storage, { mode });

  return {
    deletedCount,
    storage,
  };
}

/**
 * Delete one closed trade history entry from a specific mode.
 *
 * @param params - Target row identity.
 * @returns Updated storage and whether one row was deleted.
 */
export async function deleteSlowTradingHistoryEntry(params: {
  account: string;
  entryId?: string;
  entryTime?: number;
  exitTime?: number;
  mode: SlowTradingMode;
  quantity?: number;
  symbol: string;
  usdt?: number;
}): Promise<{ deleted: boolean; storage: SlowTradingStorageData }> {
  // A. Load the target mode and scan only the requested symbol history.
  const storage = await loadSlowTradingStorage({
    account: params.account,
    includeHistory: true,
  });
  const modeState = storage.modes[params.mode];
  let deleted = false;

  for (const tradeSetting of modeState.tradeSettings) {
    const symbol = normalizeSymbol(tradeSetting.symbol);
    if (symbol !== normalizeSymbol(params.symbol)) {
      continue;
    }

    const positionsSell = await readHistoryFile(params.mode, symbol);
    const nextPositions = [];

    // B. Drop the first matching row and keep all other closed positions.
    for (const position of positionsSell) {
      if (
        !deleted &&
        historyPositionMatches(
          {
            ...clone(position),
            symbol: tradeSetting.symbol,
            mode: params.mode,
          },
          params,
        )
      ) {
        deleted = true;
        continue;
      }

      nextPositions.push(position);
    }

    tradeSetting.model_memory.positionsSell = nextPositions;

    // C. Persist the touched symbol file immediately after the row is removed.
    if (deleted) {
      await writeHistoryFile(params.mode, symbol, nextPositions);
      break;
    }
  }

  // D. Refresh storage only when something actually changed.
  if (deleted) {
    delete modeState.dailyPnlLimitState;
    await saveSlowTradingStorage(storage);
    await hydrateSlowTradingHistoryFromFiles(storage, {
      account: params.account,
      mode: params.mode,
      symbols: [params.symbol],
    });
  }

  return {
    deleted,
    storage,
  };
}

/**
 * Update the optional note on one closed trade history entry.
 *
 * Only the matching symbol history file is rewritten so note edits stay cheap.
 * An empty note removes the optional field from the persisted position.
 */
export async function updateSlowTradingHistoryEntryNotes(params: {
  account: string;
  entryId?: string;
  entryTime?: number;
  exitTime?: number;
  mode: SlowTradingMode;
  notes: string;
  quantity?: number;
  symbol: string;
  usdt?: number;
}): Promise<{ storage: SlowTradingStorageData; updated: boolean }> {
  const storage = await loadSlowTradingStorage({
    account: params.account,
    includeHistory: true,
  });
  const normalizedSymbol = normalizeSymbol(params.symbol);
  const normalizedNotes = params.notes.trim();
  let updated = false;

  for (const tradeSetting of storage.modes[params.mode].tradeSettings) {
    if (normalizeSymbol(tradeSetting.symbol) !== normalizedSymbol) {
      continue;
    }

    const positionsSell = await readHistoryFile(params.mode, normalizedSymbol);
    const position = positionsSell.find((candidate) =>
      historyPositionMatches(
        {
          ...clone(candidate),
          symbol: tradeSetting.symbol,
          mode: params.mode,
        },
        params,
      ),
    );

    if (!position) {
      break;
    }

    // PROD:TRADE_HISTORY_NOTES
    if (normalizedNotes) {
      position.notes = normalizedNotes;
    } else {
      delete position.notes;
    }

    await writeHistoryFile(params.mode, normalizedSymbol, positionsSell);
    updated = true;
    break;
  }

  return { storage, updated };
}

/**
 * Attach mode and symbol metadata to a list of positions for dashboard output.
 *
 * @param mode - Mode that owns the positions.
 * @param symbol - Symbol that owns the positions.
 * @param positions - Raw positions list.
 * @returns Decorated position list.
 */
function withMode(
  mode: SlowTradingMode,
  symbol: string,
  positions: TradingModelMemory["positions"] = [],
): SlowTradingHistoryPosition[] {
  return positions.map((position) => ({
    ...clone(position),
    symbol,
    mode,
  }));
}

/**
 * Build the closed-position history for a specific mode.
 *
 * @param storage - Slow-trading storage.
 * @param mode - Mode to read from.
 * @returns Sorted closed-position history.
 */
export function getSlowTradingHistory(
  storage: SlowTradingStorageData,
  mode = getActiveSlowTradingMode(storage),
): SlowTradingHistoryPosition[] {
  return storage.modes[mode].tradeSettings
    .flatMap((item) =>
      withMode(mode, item.symbol, item.model_memory.positionsSell ?? []),
    )
    .sort((a, b) => (a.opened.t ?? 0) - (b.opened.t ?? 0));
}

/**
 * Build the currently open positions for a specific mode.
 *
 * @param storage - Slow-trading storage.
 * @param mode - Mode to read from.
 * @returns Sorted open positions.
 */
export function getSlowTradingOpenPositions(
  storage: SlowTradingStorageData,
  mode = getActiveSlowTradingMode(storage),
): SlowTradingHistoryPosition[] {
  return storage.modes[mode].tradeSettings
    .flatMap((item) =>
      withMode(mode, item.symbol, item.model_memory.positions ?? []),
    )
    .sort((a, b) => (a.opened.t ?? 0) - (b.opened.t ?? 0));
}
