import type { VolatilityPoint } from "@/lib/dynamic";
import type { UnifiedFundingRate } from "@/lib/exchange";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import type { ReactNode } from "react";

export interface LatestVolatilityPointsProps {
  availableTags: string[];
  coinDescriptions: Record<string, string>;
  coinTags: Record<string, string[]>;
  volatilityMap: Record<string, VolatilityPoint[]>;
  dashboardState: SlowTradingDashboardState;
  decisionEngineVersion?: string;
  deletingSymbol?: string | null;
  enteringSymbol?: string | null;
  onDeleteCoin: (symbol: string) => Promise<void>;
  onManualEntry: (symbol: string) => Promise<void>;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  openSymbols?: string[];
  tagManagerAction?: ReactNode;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  fundingRateBySymbol: Record<string, UnifiedFundingRate>;
  marketCapFetchedAtBySymbol: Record<string, number>;
  marketCapUSDBySymbol: Record<string, number>;
  volume24hBySymbol: Record<string, number>;
}

export interface VolatilityPointLabelFrequency {
  downCount: number;
  downPct: number;
  topCount: number;
  topPct: number;
}
