import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import { type FetchKlinesFunctionProps } from "@/lib/datasets/type";
import { timeMsToReadable } from "@/lib/datasets/utils";
import { TradingMode } from "@/lib/exchange";
import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import { type TradingReturn } from "@/lib/trading";
import { executeTradingV3 } from "@/lib/trading/execute-v3";
import { tradeLog } from "@/lib/trading/helper/log";
import { mergePositions } from "@/lib/trading/helper/utils";
import { MODEL_MAP, type Position } from "@/lib/trading/models";
import type { DoTradeProps } from "@lib/brain/algorithms/type-execute";

export interface DoTradeReturn {
  /**
   * For further debugging
   */
  report?: TradingReturn | null;
  /**
   * Continue Looping?
   */
  continue: boolean;
}

export async function doTrade({
  currentTimeMs,
  symbol,

  klinesMap,
  modelMemoryMap,
  modelConfig,

  getTradingDecisionFunction = MODEL_MAP["dynamic.v1"],

  dynamicTradeMemory,
  backtest,
}: DoTradeProps): Promise<DoTradeReturn> {
  // A.1 Which coin to trade?
  tradeLog.debug("A.1 Which coin to trade?");
  const modelMemory = modelMemoryMap[symbol];
  const currentKline = klinesMap[symbol].find((e) => e[0] == currentTimeMs);

  if (!currentKline) {
    tradeLog.error(
      "Missing currentKline doTrade ",
      timeMsToReadable(currentTimeMs)
    );
    return {
      continue: true,
    }; // continue
  }

  const positions = modelMemory.positions ?? [];

  const _positions: Position[] = [...positions]; // detach memory

  const fetchKlinesCustom = async (
    props: FetchKlinesFunctionProps
  ): Promise<Kline[]> =>
    await fetchKlinesFunction({
      ...props,
      // inject static data to it so it not calling real API
      klines: klinesMap[symbol],
    });

  const pos = mergePositions(modelMemory.positions);

  // A.2 Execute trading
  tradeLog.debug("A.2 Execute trading");
  const result = await executeTradingV3({
    symbol: `${symbol}_USDT`,
    current: currentKline,
    fetchKlines: fetchKlinesCustom,
    getTradingDecisionFunction,
    balance: backtest
      ? {
        quoteAsset: modelMemory.quoteAssetToTrade ?? 0,
        baseAsset: pos?.exposure.quantity ?? 0,
      }
      : undefined,
    modelConfig,
    modelMemory,
    exchangeType: dynamicTradeMemory.exchange ?? "tokocrypto",
    tradingMode: dynamicTradeMemory.tradingMode ?? TradingMode.SPOT
  });

  if (!result.action) {
    tradeLog.log(result.message);
  }

  // A.3 Make report for analysis later
  const tradingDetail = result.tradingDetail;

  // A.4 If result is null, no trade occurred
  if (!tradingDetail) {
    return {
      report: result,
      continue: true,
    };
  }

  return {
    report: result,
    continue: true,
  };
}
