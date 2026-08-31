import { getBinancePositioningHistory } from "./binance";

const exchangeAnalytics = {
  positioning: {
    history: getBinancePositioningHistory,
  },
} as const;

export default exchangeAnalytics;
export type * from "./types";
