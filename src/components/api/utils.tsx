import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import { cropKlinesToCommonRange } from "@/lib/dynamic";
import type { ExchangeType } from "@/lib/exchange";
import type { IntervalKlines } from "@/lib/exchange/platform/tokocrypto";
import path from "path";
import { COMMON_TIME, KLINES_FOLDER, makeScopedFolder } from "./constants";

interface PrepareCommonTimeDataset {
    symbols: string[];
    interval: IntervalKlines;
    range: string;
    startTime?: number;
    endTime?: number;
    useCache?: boolean;
    useCacheCommonTime?: boolean;
    exchangeType?: ExchangeType
    marketType?: "SPOT" | "FUTURES";
}

export async function prepareCommonTimeDataset({
    symbols,
    interval,
    range,
    startTime,
    endTime,
    useCache = true,
    useCacheCommonTime = true,
    exchangeType = "okx",
    marketType,
}: PrepareCommonTimeDataset) {

    const timeInformation = {
        range,
        interval,
    }

    const datasetMap: Record<string, string> = {};
    const exchangeMarketScope = marketType
        ? `${exchangeType}/${marketType}`
        : exchangeType;
    for (const symbol of symbols) {
        const TRADE_PAIR = `${symbol}_USDT`;
        const scopedFolder = makeScopedFolder({ ...timeInformation, baseFolder: KLINES_FOLDER + "/" + exchangeMarketScope });

        await fetchKlinesFunction({
            symbol: TRADE_PAIR,
            interval,
            simpleTime: range,
            startTime,
            endTime,
            folder: scopedFolder,
            saveToFile: true,
            exactDate: false,
            useCache,
            verbose: true,
            exchangeType,
            marketType,
        });

        const klinesFile = path.join(
            scopedFolder,
            `${TRADE_PAIR}_${interval}_${range}.json`
        );

        datasetMap[symbol] = klinesFile;
    }

    const BASE_COMMON_TIME_FOLDER = makeScopedFolder({ ...timeInformation, baseFolder: COMMON_TIME + "/" + exchangeMarketScope })

    const commonTime = await cropKlinesToCommonRange({
        datasetMap,
        tempPath: BASE_COMMON_TIME_FOLDER,
        useCache: useCacheCommonTime,
    });

    // Base folder cache
    return { BASE_COMMON_TIME_FOLDER, commonTime };
}


export async function delay(ms: number = 1100): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
