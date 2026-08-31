import { windowsMs } from "@/lib/dynamic/constants-time";
import { type Features } from "../../feature";
import { type ClassifierReturn } from "../type";
import { rulesLevel1 } from "./level1";
import { rulesLevel2 } from "./level2";
import { classifyObjectScore } from "./utils";

/**
 * TOP classifier (hard conditions) for decision engine v15.
 *
 * This classifier determines entry signals for TOP volatility points.
 * Currently returns no entry by default as TOP entries are experimental.
 *
 * **Level Interpretation for TOP:**
 * - Higher level= price near peak
 *
 * Created 15 Jan 2026
 * Updated 15 Jan 2026
 *
 * @param {Features} features - Extracted market features from getFeatures().
 * @returns {ClassifierReturn} Always returns no entry with reasons.
 */
export function classifierTopSoft(features: Features): ClassifierReturn {
  // A. LEVEL 2
  if (features.currentPoint.lvl == 2) {
    const prob = classifyObjectScore(features, rulesLevel2);
    if (prob > 0.6) {
      return {
        entry: true,
        probability: prob,
        label: "TOP SOFT: A. Very danger Entry",
        reasons: ["TOP SOFT: A. Very danger Entry"],
      };
    } else {
      if (
        features.btc.downRatio > 0.3 &&
        Math.abs(features.market.levelThreshold.minBottom) +
          features.market.levelThreshold.maxTop <=
          3
      ) {
        return {
          entry: true,
          probability: 1,
          label: "TOP SOFT: A. Very danger Entry",
          reasons: ["TOP SOFT: A. Very danger Entry"],
        };
      }
    }

    return {
      entry: false,
      probability: 0,
      label: "TOP SOFT: B. Very danger Entry",
      reasons: ["TOP SOFT: B. Very danger Entry"],
    };
  }

  // sampai sini udah 1.4 miliar gain%

  // B. LEVEL 1
  if (features.currentPoint.lvl == 1) {
    const prob = classifyObjectScore(features, rulesLevel1);
    if (prob > 0.5) {
      if (
        features.btc.downRatio > 0.3 &&
        features.market.globalVolatilityIndex < 0.6 &&
        features.targetCoin.velocityMove > windowsMs["1d"] * 2 &&
        features.btc.lastBTCVolatilityPoint?.lvl !== 1 &&
        features.targetCoin.currentPriceNorm > 0.2 &&
        features.comparative.diffWithBTC > 0.1 &&
        Math.abs(features.market.levelThreshold.minBottom) +
          features.market.levelThreshold.maxTop <=
          5
      ) {
        return {
          entry: true,
          probability: 1,
          label: "TOP SOFT: B. Oh my god",
          reasons: ["TOP SOFT: B. Oh my god"],
        };
      }

      return {
        entry: false,
        probability: 0,
        label: "TOP SOFT: B. Oh my god",
        reasons: ["TOP SOFT: B. Oh my god"],
      };
    }
  }

  return {
    entry: false,
    probability: 0,
    label: "No entry",
    reasons: ["TOP SOFT: No conditions met for top SOFT entry"],
  };
}
