export interface SymbolFilter {
  filterType: "PRICE_FILTER" | "LOT_SIZE" | "MIN_NOTIONAL" | string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: SymbolFilter[];
}

export interface GetSymbolsResponse {
  code: number;
  message: string;
  messageDetail: string | null;
  timestamp: number;
  success: boolean;
  data: {
    list: SymbolInfo[];
  };
}
