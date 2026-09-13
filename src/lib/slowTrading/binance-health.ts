import fs from "fs-extra";

import { FILES } from "@/components/storage";
import binanceRequestCoordinator, {
  type BinanceCooldownPersistence,
  type BinanceCooldownState,
} from "@/lib/exchange/platform/binance/request-coordinator";

import { MAX_SLOW_TRADING_LOG_ENTRIES } from "./storage/constants";
import slowTradingJsonFile from "./storage/json-file";
import type {
  SlowTradingBinanceCooldownLogEntry,
  SlowTradingBinanceHealthSnapshot,
} from "./types";

/** Reads normalized cooldown incidents from persistent SLOW storage. */
async function readLogs(): Promise<SlowTradingBinanceCooldownLogEntry[]> {
  if (!(await fs.pathExists(FILES.slow.logs.binanceCooldowns))) return [];
  const raw = await fs
    .readJSON(FILES.slow.logs.binanceCooldowns)
    .catch(() => []);
  return Array.isArray(raw)
    ? (raw as SlowTradingBinanceCooldownLogEntry[])
    : [];
}

/** Converts a persisted incident into the coordinator's active gate shape. */
function toCooldownState(
  incident: SlowTradingBinanceCooldownLogEntry,
): BinanceCooldownState {
  return {
    endpoint: incident.endpoint,
    kind: incident.kind,
    reason: incident.reason,
    retryAt: incident.end,
    startedAt: incident.t,
  };
}

const persistence: BinanceCooldownPersistence = {
  async readActive(now) {
    const latest = (await readLogs()).reduce<
      SlowTradingBinanceCooldownLogEntry | undefined
    >((selected, incident) =>
      !selected || incident.end > selected.end ? incident : selected,
    undefined);
    return latest && latest.end > now ? toCooldownState(latest) : null;
  },

  async record(params) {
    let saved!: SlowTradingBinanceCooldownLogEntry;
    await slowTradingJsonFile.update.atomic<SlowTradingBinanceCooldownLogEntry[]>(
      FILES.slow.logs.binanceCooldowns,
      (raw) => {
        const current = Array.isArray(raw)
          ? (raw as SlowTradingBinanceCooldownLogEntry[])
          : [];
        const latest = current.at(-1);
        const continuous = latest && latest.end > params.detectedAt;
        saved = continuous
          ? {
              ...latest,
              code: params.code ?? latest.code,
              end: Math.max(latest.end, params.state.retryAt),
              endpoint: params.descriptor.endpoint,
              kind: params.descriptor.kind,
              occurrences: latest.occurrences + 1,
              reason: params.state.reason,
              status: params.status ?? latest.status,
            }
          : {
              code: params.code,
              end: params.state.retryAt,
              endpoint: params.descriptor.endpoint,
              id: `binance-cooldown-${params.detectedAt}-${Math.random()
                .toString(36)
                .slice(2, 10)}`,
              kind: params.descriptor.kind,
              occurrences: 1,
              reason: params.state.reason,
              status: params.status,
              t: params.detectedAt,
            };

        return [
          ...(continuous ? current.slice(0, -1) : current),
          saved,
        ].slice(-MAX_SLOW_TRADING_LOG_ENTRIES);
      },
    );
    return toCooldownState(saved);
  },
};

/** Installs persistent cooldown coordination for the current server process. */
function install(): void {
  binanceRequestCoordinator.persistence.use(persistence);
}

/** Reads current Binance health and recent incident history. */
async function readSnapshot(
  options: { limit?: number } = {},
): Promise<SlowTradingBinanceHealthSnapshot> {
  install();
  const [current, logs] = await Promise.all([
    binanceRequestCoordinator.cooldown.refresh(),
    readLogs(),
  ]);
  const limit = Math.max(0, options.limit ?? 20);
  return {
    current,
    logs: logs.sort((left, right) => right.t - left.t).slice(0, limit),
  };
}

const slowTradingBinanceHealth = {
  coordinator: {
    install,
  },
  snapshot: {
    read: readSnapshot,
  },
  storage: {
    readLogs,
  },
} as const;

export default slowTradingBinanceHealth;
