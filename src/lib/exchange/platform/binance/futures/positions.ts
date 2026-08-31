export interface BinancePositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string; // "cross" | "isolated"
  isolatedMargin: string;
  isAutoAddMargin: string; // "true" | "false"
  positionSide: string; // "BOTH" | "LONG" | "SHORT"
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}
