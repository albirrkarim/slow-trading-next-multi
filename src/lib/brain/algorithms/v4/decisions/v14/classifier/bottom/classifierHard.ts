import { type Features } from "../../feature";
import { type ClassifierReturn } from "../type";
import { mapScaleValue } from "../utils";

/**
 * BOTTOM classifier (hard conditions) for decision engine v10.
 *
 * This classifier determines entry signals for BOTTOM volatility points
 * using strict conditions. It evaluates market context including:
 * - BTC market leadership (diffWithBTC)
 * - Price normalization (avoiding ATH entries)
 * - Down ratio (recent price decline magnitude)
 * - Volatility level (more negative = stronger signal)
 *
 * **Key Logic:**
 * - Easy money: BTC leading, stable price area, not at ATH
 * - Tight money: Stricter requirements when market is uncertain
 * - Level interpretation: More negative level = stronger buy signal (e.g., -5 is very strong)
 *
 * Created 03 Dec 2025
 * Updated 06 Dec 2025
 *
 * @param {Features} features - Extracted market features from getFeatures().
 * @returns {ClassifierReturn} Decision with entry flag, probability, label, and rejection reasons.
 *
 * @example
 * const features = getFeatures({ currentPoint, btcPriceNorm, ... });
 * const decision = classifierHard(features);
 * if (decision.entry) {
 *   console.log(`Entry signal: ${decision.label}`);
 * } else {
 *   console.log(`Rejected: ${decision.reasons.join(", ")}`);
 * }
 */
export function classifierHard(features: Features): ClassifierReturn {
  const { currentPoint, targetCoin, btc, comparative } = features;
  const { downRatio, currentPriceNorm } = targetCoin;
  const { currentPriceNorm: currentBTCPriceNorm, downRatio: downRatioBTC } =
    btc;
  const { diffWithBTC } = comparative;

  const reasons: string[] = [];

  /**
   * its not minus so btc will drag other coin is also up
   */
  const btcIsUp = diffWithBTC >= 0.1 && diffWithBTC <= 0.8;

  /**
   * Anti bear market
   */
  const stableArea =
    currentPriceNorm.c >= 0.6 && currentPriceNorm.c <= 0.4;

  /**
   * When the btc is ATH, so likelyness it will down
   */
  const notBTCATH = currentBTCPriceNorm <= 0.93;

  // A. Easy money, but also play safe
  if (btcIsUp && stableArea && notBTCATH) {
    // console.log("EASY ", currentPoint.timeHuman);

    // A.1 when down ratio is sudden, theres something danger
    if (downRatio > 0.5) {
      // Scale level requirement based on down ratio
      const minLevel = parseInt(
        mapScaleValue(0.5, 1, downRatio, -1, -4).toString()
      );
      return {
        entry: currentPoint.lvl <= minLevel,
        probability: 1,
        label: "HARD: A.1 when down ratio is sudden, theres something danger",
        reasons:
          currentPoint.lvl <= minLevel
            ? []
            : [
              `HARD: A.1 Required level <= ${minLevel} but got ${currentPoint.lvl}`,
            ],
      };
    } else {
      // A.2 Normal easy money situation
      return {
        entry: true,
        probability: 1,
        label: "A.2 Normal easy money situation",
        reasons: [],
      };
    }
  } else {
    // console.log("TIGHT ", currentPoint.timeHuman);
    // B. Tight money
    if (
      Math.abs(diffWithBTC) < 0.2 &&
      currentPoint.lvl <= -2 &&
      downRatio < 0.5
    ) {
      // B.1 Un volatile, because diff with btc is small but stay safe

      // If btc is down too, be more strict
      if (downRatioBTC > 0.5) {
        // B.1.1 Declining market, be more strict
        return {
          entry: currentPoint.lvl <= -3,
          probability: 1,
          label: "B.1.1 Declining market, be more strict",
          reasons: [],
        };
      }

      return {
        entry: true,
        probability: 1,
        label: "B.1 Un volatile, because diff with btc is small but stay safe",
        reasons: [],
      };
    }

    if (btcIsUp && downRatio < 0.5) {
      // B.2 When btc is up but other coin is not really up

      // Scaling level based on diff with btc, more diff more strict level
      let minLevel = Math.min(
        parseInt(mapScaleValue(0.1, 0.8, diffWithBTC, -5, -2).toString()),
        -2
      );

      if (btc.downRatio == 0) {
        minLevel = -3
      }

      if (currentPoint.lvl <= minLevel) {
        if (currentPriceNorm.c < 0.3) {
          // 6730.67% gain
          return {
            entry: true,
            probability: 1,
            label: "B.2 When btc is up but other coin is not really up",
            reasons: [],
          };
        } else {
          reasons.push(
            `HARD: rejected B.2 currentPriceNorm ${currentPriceNorm.c} >= 0.3`
          );
        }
      } else {
        reasons.push(
          `HARD: rejected B.2 current level ${currentPoint.lvl} > minLevel ${minLevel}`
        );
      }
    } else {
      reasons.push(
        `HARD: rejected B.2 btcIsUp: ${btcIsUp}, downRatio: ${downRatio}`
      );
    }

    if (currentPoint.lvl <= -4) {
      // B.3 other wise stay safe
      // Level -4 is usually very good entry

      // B.3.1 other wise stay safe - too risky if btc is down hard
      if (downRatioBTC > 0.85 && diffWithBTC < 0) {
        return {
          entry: currentPoint.lvl <= -5,
          probability: 1,
          label: "B.3.1 other wise stay safe - too risky if btc is down hard",
          reasons: [],
        };
      } else {
        reasons.push(
          `HARD: rejected B.3.1 current downRatioBTC ${downRatioBTC} , diffWithBTC ${diffWithBTC}`
        );
      }

      // B.3.2 Special case for XLM due to its historical behavior
      if (currentPoint.symbol === "XLM") {
        if (downRatioBTC > downRatio) {
          return {
            entry: currentPoint.lvl <= -5,
            probability: 1,
            label: "B.3.2 other wise stay safe - special case for XLM",
            reasons: [],
          };
        } else {
          reasons.push(
            `HARD: rejected B.3.2 downRatioBTC ${downRatioBTC} <= downRatio ${downRatio}`
          );
        }
      } else {
        reasons.push(`HARD: rejected B.3.2 not XLM coin`);
      }

      return {
        entry: true,
        probability: 1,
        label: "B.3 other wise stay safe LEVEL -4",
        reasons: [],
      };
    } else {
      reasons.push(
        `HARD: rejected B.3 current level ${currentPoint.lvl} > -4`
      );
    }
  }

  return {
    entry: false,
    probability: 0,
    label: "No entry",
    reasons,
  };
}
