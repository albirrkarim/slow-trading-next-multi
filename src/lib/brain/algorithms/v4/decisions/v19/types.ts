import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import type {
  EntryRecommendationDiagnostic,
  EntryRecommendationEvaluation,
} from "@lib/brain/algorithms/type-execute";
import type { VolatilityPoint } from "@lib/dynamic/utils/volatility";
import type { SpeedTier } from "./constants";

export type SpeedTierBySymbol = Record<string, SpeedTier>;
export type LatestKlineBySymbol = Record<string, Kline | undefined>;

export interface V19TimingCandidate {
  estimatedEntryAt: number;
  estimatedExitAt: number;
  pctLikelynessToNextLevel: number;
  projected: boolean;
  speedTier: SpeedTier;
  transitionMs: number;
  volatilityPoint: VolatilityPoint;
}

export type V19EntryDiagnosticCode =
  | "BTC_CONTEXT_ONLY"
  | "CLASSIFIER_REJECTED"
  | "FASTER_CANDIDATE_SELECTED"
  | "MISSING_BTC_PRICE_NORM"
  | "READY"
  | "USED_VOLATILITY_POINT"
  | "WAITING_FOR_PROJECTION";

export interface V19EntryDiagnostic extends EntryRecommendationDiagnostic {
  code: V19EntryDiagnosticCode;
}

export type V19SelectionResult =
  EntryRecommendationEvaluation<V19EntryDiagnostic>;
