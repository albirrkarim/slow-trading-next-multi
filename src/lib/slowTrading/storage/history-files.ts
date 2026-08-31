import { FILES } from "@/components/storage";
import type { Position } from "@/lib/trading/models";
import fs from "fs-extra";
import path from "path";
import { clone, normalizeSymbol } from "./common";
import type { HistoryPosition } from "./internal-types";
import type {
  SlowTradingMode,
  SlowTradingModeState,
  SlowTradingStorageData,
} from "../types";

interface HydrateSlowTradingHistoryOptions {
  /** Restrict hydration to one mode. Omit to hydrate both live and sandbox. */
  mode?: SlowTradingMode;
  /** Restrict hydration to these normalized symbols. Omit for all symbols. */
  symbols?: string[];
  /** Keep only positions closed at or after this timestamp. */
  fromTime?: number;
}

/**
 * Gets mode history root from SLOW state or storage.
 */
export function getModeHistoryRoot(mode: SlowTradingMode): string {
  return mode === "sandbox"
    ? FILES.slow.sandbox.historyRoot
    : FILES.slow.live.historyRoot;
}

/**
 * Gets mode history file from SLOW state or storage.
 */
function getModeHistoryFile(mode: SlowTradingMode, symbol: string): string {
  return path.join(getModeHistoryRoot(mode), `${normalizeSymbol(symbol)}.json`);
}

/**
 * Handles the history position key SLOW flow from input through output.
 */
function historyPositionKey(symbol: string, position: HistoryPosition): string {
  return [
    normalizeSymbol(symbol),
    position.opened.vPoint.id,
    position.opened.t,
    position.closed?.t ?? "",
    position.exposure.quantity,
    position.exposure.notionalUsdt,
  ].join("|");
}

/**
 * Reads history file from SLOW persistent storage.
 */
export async function readHistoryFile(
  mode: SlowTradingMode,
  symbol: string,
): Promise<Position[]> {
  const filePath = getModeHistoryFile(mode, symbol);
  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  const raw = await fs.readJSON(filePath);
  return Array.isArray(raw) ? raw : [];
}

/** Reads closed positions whose closing time falls within a half-open range. */
export async function readHistoryRange(params: {
  endTime: number;
  mode: SlowTradingMode;
  startTime: number;
}): Promise<Position[]> {
  const entries = await fs
    .readdir(getModeHistoryRoot(params.mode), { withFileTypes: true })
    .catch(() => []);
  const history: Position[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const symbol = normalizeSymbol(path.basename(entry.name, ".json"));
    const positions = await readHistoryFile(params.mode, symbol);
    history.push(
      ...positions.filter((position) => {
        const closedAt = position.closed?.t;
        return (
          typeof closedAt === "number" &&
          Number.isFinite(closedAt) &&
          closedAt >= params.startTime &&
          closedAt < params.endTime
        );
      }),
    );
  }

  return history.sort(
    (left, right) => (left.closed?.t ?? 0) - (right.closed?.t ?? 0),
  );
}

/**
 * Filters persisted history rows for memory hydration.
 */
function filterHistoryPositions(
  positions: Position[],
  options: HydrateSlowTradingHistoryOptions,
): Position[] {
  const fromTime =
    typeof options.fromTime === "number" && Number.isFinite(options.fromTime)
      ? options.fromTime
      : null;

  if (fromTime == null) {
    return positions;
  }

  return positions.filter(
    (position) => (position.closed?.t ?? 0) >= fromTime,
  );
}

/**
 * Writes history file into SLOW persistent storage.
 */
export async function writeHistoryFile(
  mode: SlowTradingMode,
  symbol: string,
  positions: Position[],
) {
  const filePath = getModeHistoryFile(mode, symbol);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(
    filePath,
    [...positions].sort((a, b) => (a.opened.t ?? 0) - (b.opened.t ?? 0)),
  );
}

/**
 * Appends history positions to SLOW persistent storage.
 */
async function appendHistoryPositions(params: {
  mode: SlowTradingMode;
  symbol: string;
  positions: Position[];
}): Promise<number> {
  const symbol = normalizeSymbol(params.symbol);
  const incoming = params.positions.filter((position) => position.closed?.t);
  if (incoming.length === 0) {
    return 0;
  }

  const existing = await readHistoryFile(params.mode, symbol);
  const seen = new Set(
    existing.map((position) => historyPositionKey(symbol, position)),
  );
  const next = [...existing];
  let added = 0;

  for (const position of incoming) {
    const key = historyPositionKey(symbol, position);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(clone(position));
    added += 1;
  }

  if (added > 0) {
    await writeHistoryFile(params.mode, symbol, next);
  }

  return added;
}

/**
 * Persists closed positions to history files from memory into SLOW storage.
 */
export async function persistClosedPositionsToHistoryFiles(
  mode: SlowTradingMode,
  modeState: SlowTradingModeState,
): Promise<number> {
  let archived = 0;

  for (const tradeSetting of modeState.tradeSettings) {
    const symbol = normalizeSymbol(tradeSetting.symbol);
    const positionsSell = tradeSetting.model_memory.positionsSell ?? [];
    archived += await appendHistoryPositions({
      mode,
      symbol,
      positions: positionsSell,
    });
    tradeSetting.model_memory.positionsSell = [];
  }

  return archived;
}

/**
 * Hydrates mode history from files from SLOW history files into memory.
 */
async function hydrateModeHistoryFromFiles(
  mode: SlowTradingMode,
  modeState: SlowTradingModeState,
  options: HydrateSlowTradingHistoryOptions = {},
) {
  // PROD:HISTORY_CONFIG_INDEPENDENT
  // Report loads discover persisted symbols independently from config symbols.
  if (!options.symbols) {
    const historyRoot = getModeHistoryRoot(mode);
    const entries = await fs
      .readdir(historyRoot, { withFileTypes: true })
      .catch(() => []);
    const existingSymbols = new Set(
      modeState.tradeSettings.map((item) => normalizeSymbol(item.symbol)),
    );
    const persistedSymbols = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => normalizeSymbol(path.basename(entry.name, ".json")))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    for (const symbol of persistedSymbols) {
      if (existingSymbols.has(symbol)) {
        continue;
      }

      existingSymbols.add(symbol);
      modeState.tradeSettings.push({
        symbol,
        model_memory: {
          positions: [],
        },
      });
    }
  }

  const allowedSymbols = options.symbols
    ? new Set(options.symbols.map((symbol) => normalizeSymbol(symbol)))
    : null;

  for (const tradeSetting of modeState.tradeSettings) {
    const symbol = normalizeSymbol(tradeSetting.symbol);
    if (allowedSymbols && !allowedSymbols.has(symbol)) {
      continue;
    }

    tradeSetting.model_memory.positionsSell = filterHistoryPositions(
      await readHistoryFile(mode, symbol),
      options,
    );
  }
}

/**
 * Hydrates slow trading history from files from SLOW history files into memory.
 */
export async function hydrateSlowTradingHistoryFromFiles(
  storage: SlowTradingStorageData,
  options: HydrateSlowTradingHistoryOptions = {},
) {
  if (!options.mode || options.mode === "live") {
    await hydrateModeHistoryFromFiles("live", storage.modes.live, options);
  }

  if (!options.mode || options.mode === "sandbox") {
    await hydrateModeHistoryFromFiles(
      "sandbox",
      storage.modes.sandbox,
      options,
    );
  }
}

/**
 * Strips closed positions from memory from in-memory SLOW state after persistence.
 */
export function stripClosedPositionsFromModeMemory(
  modeState: SlowTradingModeState,
): SlowTradingModeState {
  const next = clone(modeState);

  for (const tradeSetting of next.tradeSettings) {
    delete tradeSetting.model_memory.positionsSell;
  }

  return next;
}

/**
 * Strips closed positions from memory from in-memory SLOW state after persistence.
 */
export function stripClosedPositionsFromMemory(
  modes: SlowTradingStorageData["modes"],
): SlowTradingStorageData["modes"] {
  const next = clone(modes);

  for (const mode of ["live", "sandbox"] as const) {
    next[mode] = stripClosedPositionsFromModeMemory(next[mode]);
  }

  return next;
}

/**
 * Migrates inline closed positions to history files into the current SLOW storage layout.
 */
export async function migrateInlineClosedPositionsToHistoryFiles(
  storage: SlowTradingStorageData,
): Promise<boolean> {
  let changed = false;

  for (const mode of ["live", "sandbox"] as const) {
    const archived = await persistClosedPositionsToHistoryFiles(
      mode,
      storage.modes[mode],
    );
    changed = changed || archived > 0;
  }

  return changed;
}

/**
 * Migrates legacy history root into the current SLOW storage layout.
 */
export async function migrateLegacyHistoryRoot(): Promise<void> {
  const root = FILES.slow.legacyHistoryRoot;
  if (!(await fs.pathExists(root))) {
    return;
  }

  const entries = await fs.readdir(root).catch(() => []);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const symbol = normalizeSymbol(path.basename(entry, ".json"));
    const raw = await fs.readJSON(path.join(root, entry)).catch(() => []);
    const positions = Array.isArray(raw) ? (raw as HistoryPosition[]) : [];
    const grouped: Record<SlowTradingMode, Position[]> = {
      live: [],
      sandbox: [],
    };

    for (const position of positions) {
      const mode =
        position.executionMode === "sandbox"
          ? "sandbox"
          : "live";
      grouped[mode].push(position);
    }

    await appendHistoryPositions({
      mode: "live",
      symbol,
      positions: grouped.live,
    });
    await appendHistoryPositions({
      mode: "sandbox",
      symbol,
      positions: grouped.sandbox,
    });
  }

  await fs.remove(root);
}
