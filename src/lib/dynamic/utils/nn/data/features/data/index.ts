import type { GlobalMarketData } from "../features-type";
import { fetchFearGreedIndex } from "./fear-greed";
import { fetchFredSeries } from "./fred";

export async function getGlobalMarketData(): Promise<GlobalMarketData> {
  const fedRateData = await fetchFredSeries("DFF");
  const m2Data = await fetchFredSeries("M2SL");
  const fearGreeData = await fetchFearGreedIndex({ simpleTime: "5year" });

  return {
    fedRateData,
    m2Data,
    fearGreeData,
  };
}
