import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import { decisionEngineLevelConfig } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import type { VolatilityPoint } from "@/lib/dynamic";

const entrySequenceCandidates = {
  threshold: {
    /**
     * Resolves the dashboard threshold with the same rules as decision v19.
     */
    resolve(value?: number) {
      return decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(value);
    },
  },

  /**
   * Builds client-side entry candidates from loaded vPoints for dashboard-only
   * metric estimates. This avoids replaying the full decision engine on the API
   * path when the metric panels are collapsed.
   */
  build({
    minActionableAbsoluteLevel,
    volatilityMap,
  }: {
    minActionableAbsoluteLevel?: number;
    volatilityMap: Record<string, VolatilityPoint[]>;
  }): EntryRecommendation[] {
    const threshold = entrySequenceCandidates.threshold.resolve(
      minActionableAbsoluteLevel,
    );

    return Object.entries(volatilityMap).flatMap(([rawSymbol, points]) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (symbol === "BTC") return [];

      return points
        .filter((point) => Math.abs(point.lvl) >= threshold)
        .map((point) => ({
          ...point,
          amountProbab: 1,
          maxLeverage: 1,
          message: "client vPoint entry candidate",
          symbol,
        }));
    });
  },
};

export default entrySequenceCandidates;
