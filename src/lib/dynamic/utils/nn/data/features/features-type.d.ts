import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type { VolatilityPoint } from "@lib/dynamic/utils/volatility";

export interface GroupedInput {
  currentInfo: number[];
  price: number[];

  volume: number[];
  freqLevel: number[];

  timeGap?: number[];
  btcPrice?: number[];
  m2?: number[];
  fedRate?: number[];
  fearAndGreed?: number[];
}

export interface GlobalMarketData {
  m2Data: FredDataPoint[];
  fedRateData: FredDataPoint[];
  fearGreeData: FearGreedPoint[];
}

/**
 * Used in features-v2
 */
export interface MakeVectorAdditionalProps {
  /**
   * {
   *  BTC:[]
   *  ETH:[]
   * }
   */
  volatilityPointsMap: Record<string, VolatilityPoint[]>;

  /**
   * Just short of kline for 1 week
   *
   * keep the memory simple
   */
  klinesMap: Record<string, Kline[]>;

  /**
   * FED RATE, M2 Money
   */
  globalMarketData: GlobalMarketData;
}

export interface MakeVectorProps extends MakeVectorAdditionalProps {
  /**
   * BTC, SOL,
   */
  symbol: string;

  current: VolatilityPoint;

  prevPoints: VolatilityPoint[];

  oneMonthSnaps: VolatilitySnapshot[];

  opts?: MakeDatasetOpts;
}

export interface MakeVectorReturn {
  input: number[];
  inputGrouped?: GroupedInput;
}
