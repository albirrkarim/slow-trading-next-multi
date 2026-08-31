import { deepCopy } from "@/components/client/utils";
import { FILES } from "@/components/storage";
import type {
  DynamicTradeMemory,
  PredictionEngineMemory,
  VolatilityPoint,
} from "@/lib/dynamic";
import {
  DEFAULT_DYNAMIC_TRADING_MEMORY,
  generateInitialPriceNorm,
  predictionEngine,
} from "@/lib/dynamic";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import exchangeFundingRate from "@/lib/exchange/funding-rate";
import {
  getMarketCapFetchedAtMapForSymbols,
  getMarketCapUSDMapForSymbols,
} from "@/lib/exchange/market-cap";
import type { ExchangeType } from "@/lib/exchange/types";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET" || req.method === "POST") {
    await initializeDashboard(req, res);
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function pickExchangeParam(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    return typeof first === "string" ? first.trim() : undefined;
  }

  return undefined;
}

async function initializeDashboard(req: NextApiRequest, res: NextApiResponse) {
  const params = req.method == "GET" ? req.query : req.body;
  const requestedExchangeType = pickExchangeParam(params.exchangeType);
  const slowStorage = await slowTrading.storage.data.load({
    modeScope: "active",
  });
  const exchangeType =
    requestedExchangeType ??
    slowStorage.config.exchangeType ??
    DEFAULT_EXCHANGE;
  const tradingMode = slowStorage.config.tradingMode;
  const marketType = resolveMarketTypeForTradingMode(tradingMode);

  // Destructure from body
  const {
    reinitialize = false,
    symbols = ["ETH", "HBAR"],
    verbose = false,
    logCategories,
  } = params;

  const logSession = tradeLog.startSession({
    categories: logCategories,
    verbose: Boolean(verbose),
  });

  try {
    tradeLog.log("exchangeType", exchangeType);
    tradeLog.log("tradingMode", tradingMode);
    tradeLog.log("marketType", marketType);

    if (!(await fs.exists(FILES.slow.system))) {
      await fs.writeJson(FILES.slow.system, {
        exchangeType,
      });
    }

    if (reinitialize) {
      await fs.remove(FILES.slow.priceNormMapOverTime(exchangeType));
      await fs.remove(FILES.slow.volatility(exchangeType));
    }

    await fs.ensureDir(FILES.slow.volatility(exchangeType));

    let volumeSnapshot = await slowTrading.marketVolume.snapshot.read(
      exchangeType as ExchangeType,
      marketType,
    );
    try {
      volumeSnapshot = await slowTrading.marketVolume.snapshot.refresh({
        exchangeType: exchangeType as ExchangeType,
        marketType,
        symbols,
      });
    } catch (error) {
      tradeLog.error("Failed to refresh 24h ticker volume", error);
    }

    const marketCapUSDBySymbol = await getMarketCapUSDMapForSymbols(symbols);
    const marketCapFetchedAtBySymbol =
      await getMarketCapFetchedAtMapForSymbols(symbols);
    let fundingRateBySymbol = {};
    try {
      fundingRateBySymbol = await exchangeFundingRate.latest.map({
        exchangeType: exchangeType as ExchangeType,
        tradingMode,
        symbols,
      });
    } catch (error) {
      tradeLog.error("Failed to refresh dashboard funding rates", error);
    }

    if (
      !(await fs.exists(FILES.slow.priceNormMapOverTime(exchangeType))) ||
      reinitialize
    ) {
      // Volatility
      const volatilityMap: Record<string, VolatilityPoint[]> = {};
      // check directory
      const files = await fs.readdir(FILES.slow.volatility(exchangeType));

      tradeLog.log("files ", files);

      for (const symbol of symbols) {
        // A. Load existing volatility from file if exists
        if (
          (await fs.exists(
            `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
          )) &&
          !reinitialize
        ) {
          tradeLog.debug(
            "A. Load existing volatility from file if exists ",
            symbol,
          );
          const data = (await fs.readJSON(
            `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
          )) as PredictionEngineMemory;

          volatilityMap[symbol] = data.lastVolatility;
        } else {
          // B. Otherwise, generate new volatility data
          tradeLog.debug("B. Otherwise, generate new volatility data ", symbol);

          const vMemory = {
            symbol,
            lastVolatility: [],
          };

          await predictionEngine({
            tradePair: `${symbol}_USDT`,
            memory: vMemory,
            endTime: Date.now(),
            exchangeType,
            marketType,
            minActionableAbsoluteLevel:
              slowStorage.config.minActionableAbsoluteLevel,
          });

          await fs.writeJson(
            `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
            vMemory,
          );

          volatilityMap[symbol] = vMemory.lastVolatility;
        }
      }

      // Price Norm
      const dynamicTradeMemory: DynamicTradeMemory = deepCopy(
        DEFAULT_DYNAMIC_TRADING_MEMORY,
      );
      const currentTimeMs = Date.now();

      await generateInitialPriceNorm({
        currentTimeMs,
        symbols,
        startTime: currentTimeMs,
        dynamicTradeMemory,
        useCache: false,
        saveToFile: true,
        exchangeType,
        volatilityMap,
      });
    }

    res.json({
      message: "Dashboard initialized successfully",
      data: {
        exchangeType,
        fundingRateBySymbol,
        marketType,
        marketCapFetchedAtBySymbol,
        marketCapUSDBySymbol,
        tradingMode,
        volume24hBySymbol: volumeSnapshot?.volumes ?? {},
        volume24hUpdatedAt: volumeSnapshot?.t ?? null,
      },
    });
  } finally {
    tradeLog.endSession(logSession);
  }
}
