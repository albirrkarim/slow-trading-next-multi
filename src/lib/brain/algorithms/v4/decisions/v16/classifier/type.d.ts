export interface ClassifierReturn {
  entry: boolean;
  probability: number;
  maxUsdtEntry?: number;
  label: string;
  reasons: string[];
}
