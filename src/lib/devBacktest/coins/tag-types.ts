import type { CoinFilterConfig } from "./filter-config";

export const DEFAULT_COIN_TAG_COLOR = "#1976d2";

export interface CoinTag {
  color: string;
  coins: string[];
  description: string;
  filters?: CoinFilterConfig | null;
  tagId: number;
  text: string;
}

export interface CoinTagState {
  coinDescriptions: Record<string, string>;
  coinTags: Record<string, string[]>;
  tags: CoinTag[];
}
