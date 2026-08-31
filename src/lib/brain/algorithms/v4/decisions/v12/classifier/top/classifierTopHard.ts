import { type Features } from "../../feature";
import { type ClassifierReturn } from "../type";
import { mapScaleValue } from "../utils";

/**
 * TOP classifier (hard conditions) for decision engine v10.
 *
 * This classifier determines entry signals for TOP volatility points.
 * Currently returns no entry by default as TOP entries are experimental.
 *
 * **Level Interpretation for TOP:**
 * - Higher level (closer to 0 or positive) = price near peak
 * - Level 0 or 1 = at peak, likely to fall soon
 * - Level -4 to -1 = potential entry before final rise
 *
 * **Design Note:**
 * TOP trading is commented out pending further strategy validation.
 * The logic attempts to catch late-stage rallies before reversal.
 *
 * Created 03 Dec 2025
 * Updated 06 Dec 2025
 *
 * @param {Features} features - Extracted market features from getFeatures().
 * @returns {ClassifierReturn} Always returns no entry with reasons.
 *
 * @example
 * const decision = classifierTopHard(features);
 * // Currently always returns: { entry: false, probability: 0, label: "No entry", reasons: [...] }
 */
export function classifierTopHard(features: Features): ClassifierReturn {
  // const { currentPoint, targetCoin, btc, comparative, sensitive, trading } = features;
  // const { downRatio, currentPriceNorm, velocityDownTime } = targetCoin;
  // const { currentPriceNorm: currentBTCPriceNorm, downRatio: downRatioBTC } =
  //   btc;
  // const { diffWithBTC } = comparative;

  const scale = mapScaleValue(0, 1, features.targetCoin.downRatio, 6, 2)
  let minLevel = Math.round(scale)

  if (features.btc.downRatio == 0 && features.targetCoin.currentPriceNorm.c < 0.75) {
    if (minLevel < 6) {
      minLevel = 6
    }
  }

  if (features.currentPoint.lvl > minLevel) {
    return {
      entry: true,
      probability: 1,
      label: "TOP HARD: A. level 2 is good",
      reasons: ["TOP HARD: A. level 2 is good"],
    };
  }

  return {
    entry: false,
    probability: 0,
    label: "No entry",
    reasons: ["TOP HARD: No conditions met for top hard entry"],
  };
}
