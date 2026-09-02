import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import { decisionEngineLevelConfig } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import type { PredictionEngineMemory, VolatilityPoint } from "@/lib/dynamic";
import { predictionEngine } from "@/lib/dynamic";
import { tradeLog } from "@/lib/trading";
import type { TradingModelMemory } from "@/lib/trading/models";
import fs from "fs-extra";
import type { TradeSettings } from "../dynamic";
import { FILES } from "@/components/storage";
import type { ExchangeType, TradingMode } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import slowTradingJsonFile from "@/lib/slowTrading/storage/json-file";
import slowTradingPublicMarketCache from "@/lib/slowTrading/public-market-cache";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getVolatilityFile(exchangeType: ExchangeType, symbol: string) {
  return `${FILES.slow.volatility(exchangeType)}/${symbol}.json`;
}

/** Atomically merges one symbol's completed public volatility calculation. */
export async function persistVolatilityMemory(params: {
  exchangeType: ExchangeType;
  memory: PredictionEngineMemory;
  symbol: string;
}): Promise<PredictionEngineMemory> {
  return slowTradingJsonFile.update.atomic<PredictionEngineMemory>(
    getVolatilityFile(params.exchangeType, params.symbol),
    (current) =>
      mergeVolatilityMemoryById(
        current as PredictionEngineMemory | undefined,
        params.memory,
      ),
  );
}

/** Refreshes and persists public volatility once for concurrent consumers. */
async function refreshSharedVolatility(params: {
  exchangeType: ExchangeType;
  marketType: "FUTURES" | "SPOT";
  minActionableAbsoluteLevel?: number;
  symbol: string;
}): Promise<PredictionEngineMemory> {
  const key = [
    "volatility",
    params.exchangeType,
    params.marketType,
    params.symbol,
    params.minActionableAbsoluteLevel ?? "default",
  ].join(":");

  return slowTradingPublicMarketCache.operation.singleFlight(key, async () => {
    const file = getVolatilityFile(params.exchangeType, params.symbol);
    const fileExists = await fs.exists(file);
    const memory = fileExists
      ? ((await fs.readJSON(file)) as PredictionEngineMemory)
      : {
          symbol: params.symbol,
          lastVolatility: [],
        };
    const beforeRefresh = fileExists ? JSON.stringify(memory) : null;

    await predictionEngine({
      tradePair: `${params.symbol}_USDT`,
      memory,
      endTime: Date.now(),
      exchangeType: params.exchangeType,
      marketType: params.marketType,
      minActionableAbsoluteLevel: params.minActionableAbsoluteLevel,
    });

    if (!fileExists || JSON.stringify(memory) !== beforeRefresh) {
      // PROD:VOLATILITY_INCREMENTAL_PERSISTENCE
      return persistVolatilityMemory({
        exchangeType: params.exchangeType,
        memory,
        symbol: params.symbol,
      });
    }

    return memory;
  });
}

/**
 * Assigns model memory from `tradeSettings` into the `modelMemoryMap`.
 * Ensures that the memory object from settings is correctly referenced.
 *
 * @param {Record<string, TradingModelMemory>} modelMemoryMap - The map to populate.
 * @param {TradeSettings[]} tradeSettings - The incoming trade settings from the request.
 * @returns {Promise<{ error: string | false }>} An object indicating if an error occurred.
 */
export async function assignModelMemory(
  modelMemoryMap: Record<string, TradingModelMemory>,
  tradeSettings: TradeSettings[],
) {
  if (tradeSettings.length > 0) {
    for (const item of tradeSettings) {
      try {
        if (typeof item.model_memory == "string") {
          tradeLog.error("tradeSettings must be parsed into object");
          return {
            error: `tradeSettings must be parsed into object`,
          };
        }

        // We need object because modelMemoryMap[item.symbol] is referenced to item.model_memory
        modelMemoryMap[item.symbol] = item.model_memory as TradingModelMemory;
      } catch (error) {
        tradeLog.error(error);
        tradeLog.error("Cant parse model memory of ", item.symbol);
      }
    }
  }

  return {
    error: false,
  };
}

/**
 * Loads and assigns volatility data for each symbol.
 * Tries to load from JSON cache first, then runs the prediction engine to generate fresh volatility points if needed.
 *
 * @param {Record<string, TradingModelMemory>} modelMemoryMap - The map containing trading memory for each symbol.
 * @param {string[]} symbols - List of symbols to process.
 * @param {ExchangeType} exchangeType - The exchange type (e.g., 'tokocrypto', 'binance').
 * @param {TradingMode} tradingMode - Configured execution mode used to select the kline market.
 * @param {number} minActionableAbsoluteLevel - Minimum absolute level that may trigger an entry.
 */
export async function assignVolatility(
  modelMemoryMap: Record<string, TradingModelMemory>,
  symbols: string[],
  exchangeType: ExchangeType,
  tradingMode: TradingMode,
  minActionableAbsoluteLevel?: number,
) {
  tradeLog.debug("\n\nassignVolatility");

  const marketType = resolveMarketTypeForTradingMode(tradingMode);
  // Assign v points
  for (const symbol of symbols) {
    if (!modelMemoryMap[symbol]) {
      modelMemoryMap[symbol] = {
        positions: [],
      };
    }

    const vMemory = cloneJson(
      await refreshSharedVolatility({
        exchangeType,
        marketType,
        minActionableAbsoluteLevel,
        symbol,
      }),
    );
    modelMemoryMap[symbol].volatility = vMemory;

    const fullLength = vMemory.lastVolatility.length;
    const earliestActivePositionOpenedAt = modelMemoryMap[symbol].positions
      ?.filter((position) => !position.closed)
      .reduce<number | undefined>((earliest, position) => {
        const openedAt = Number(position.opened?.t);
        if (!Number.isFinite(openedAt)) {
          return earliest;
        }
        return earliest === undefined ? openedAt : Math.min(earliest, openedAt);
      }, undefined);
    vMemory.lastVolatility = pruneVolatilityPoints(
      vMemory.lastVolatility,
      earliestActivePositionOpenedAt,
    );
    tradeLog.debug(
      "PRUNED vMemory.lastVolatility.length ",
      symbol,
      `${fullLength} -> ${vMemory.lastVolatility.length}`,
    );
  }

  tradeLog.debug("AssignVolatility END\n\n\n");
}

/**
 * Limits loaded volatility points while retaining the post-entry path required
 * to evaluate every active position.
 *
 * @param activePositionOpenedAt Earliest active position opening time to retain.
 */
export function pruneVolatilityPoints(
  vPoints: VolatilityPoint[],
  activePositionOpenedAt?: number,
): VolatilityPoint[] {
  const latestNeutralIndex = vPoints.findLastIndex((point) => point.lvl === 0);

  if (latestNeutralIndex < 0) {
    return [...vPoints];
  }

  const normalizedOpenedAt = Number(activePositionOpenedAt);
  const firstPostEntryIndex = Number.isFinite(normalizedOpenedAt)
    ? vPoints.findIndex(
        (point) => Number.isFinite(point.t) && point.t > normalizedOpenedAt,
      )
    : -1;
  const firstRequiredIndex =
    firstPostEntryIndex < 0
      ? latestNeutralIndex
      : Math.min(latestNeutralIndex, firstPostEntryIndex);

  return vPoints.slice(firstRequiredIndex);
}

/**
 * Merges pruned runtime volatility points into the full persisted memory by id.
 *
 * Runtime may only carry the latest sequence, but entry execution can mutate a
 * point, e.g. marking it used. Merging by id preserves older disk points while
 * keeping runtime updates and newly detected points.
 */
export function mergeVolatilityMemoryById(
  persisted: PredictionEngineMemory | undefined,
  runtime: PredictionEngineMemory,
): PredictionEngineMemory {
  const pointById = new Map<string, VolatilityPoint>();

  for (const point of persisted?.lastVolatility ?? []) {
    pointById.set(point.id, point);
  }

  for (const point of runtime.lastVolatility ?? []) {
    pointById.set(point.id, {
      ...pointById.get(point.id),
      ...point,
    });
  }

  return {
    ...persisted,
    ...runtime,
    lastVolatility: [...pointById.values()].sort(
      (left, right) => left.t - right.t,
    ),
  };
}

/**
 * Checks if any symbol has a `justBuy` flag in its memory, triggering a manual entry signal.
 * This allows specialized manual interventions via the memory state.
 *
 * @param {Record<string, TradingModelMemory>} modelMemoryMap - The map of trading memory.
 * @returns {EntryRecommendation[]} A list of generated manual entry recommendations.
 */
export function getManualEntrySignal(
  modelMemoryMap: Record<string, TradingModelMemory>,
  minActionableAbsoluteLevel?: number,
): EntryRecommendation[] {
  const entrySignals: EntryRecommendation[] = [];

  for (const symbol of Object.keys(modelMemoryMap)) {
    if (modelMemoryMap[symbol].justBuy) {
      const lastVolatility =
        modelMemoryMap[symbol].volatility?.lastVolatility.at(-1);

      if (
        lastVolatility &&
        decisionEngineLevelConfig.isActionableLevel(
          lastVolatility,
          minActionableAbsoluteLevel,
        )
      ) {
        entrySignals.push({
          ...lastVolatility,
          message: TRADE_MESSAGE.buy.MANUAL,
          maxLeverage: 2,
          amountProbab: 1,
          maxUsdtEntry:
            typeof modelMemoryMap[symbol].justBuy === "number"
              ? modelMemoryMap[symbol].justBuy
              : undefined,
        });
      }
    }
  }

  return entrySignals;
}
