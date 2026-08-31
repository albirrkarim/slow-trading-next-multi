import { windowsMs } from "@/lib/dynamic/constants-time";
import { type Features } from "../../feature";
import { type ClassifierReturn } from "../type";
import { rulesLevel3 } from "./level3";
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
export function classifierTopHard(features: Features): ClassifierReturn {
  // A. LEVEL 6
  if (features.currentPoint.lvl == 6) {
    return {
      entry: true,
      probability: 1,
      label: "TOP HARD: A. Easy entry",
      reasons: ["TOP HARD: A. Easy entry"],
    };
  }

  // B. LEVEL 5
  if (features.currentPoint.lvl == 5) {
    // 1. Minimum Price Position:
    // Prevent shorting at the bottom (e.g. priceNorm < 0.5).
    if (features.targetCoin.currentPriceNorm < 0.5) {
      return {
        entry: false,
        probability: 0,
        label: "TOP HARD: B. Price too low for Level 5 Short (< 0.5)",
        reasons: ["TOP HARD: B. Price too low for Level 5 Short (< 0.5)"],
      };
    }

    if (features.btc.downRatio > 0) {
      return {
        entry: true,
        probability: 1,
        label: "TOP HARD: B. Medium entry",
        reasons: ["TOP HARD: B. Medium entry"],
      };
    }
  }

  // C. LEVEL 4
  if (features.currentPoint.lvl == 4) {
    // 0. BTC is up
    if (features.btc.downRatio > 0) {
      return {
        entry: false,
        probability: 0,
        label: "TOP HARD: C. BTC is up",
        reasons: ["TOP HARD: C. BTC is up"],
      };
    }

    // 1. BTC Protection: Don't short if BTC is nearing a bottom (oversold)
    if (features.btc.downRatio >= 0.7) {
      return {
        entry: false,
        probability: 0,
        label: "TOP HARD: C. BTC downRatio too high (>0.7), risk of bounce",
        reasons: ["TOP HARD: C. BTC downRatio too high (>0.7), risk of bounce"],
      };
    }

    // 2. Slow Grind Protection (Breakout at Top):
    // If we are at the absolute top (currentPriceNorm ~ 1) AND the move was slow (> 6 hours),
    // it indicates a strong trend breakout rather than a volatility spike.
    if (
      features.targetCoin.currentPriceNorm > 0.95 &&
      features.targetCoin.velocityMove > windowsMs["1h"] * 6
    ) {
      return {
        entry: false,
        probability: 0,
        label: "TOP HARD: C. Breakout risk (Price at Top & Slow Velocity)",
        reasons: ["TOP HARD: C. Breakout risk (Price at Top & Slow Velocity)"],
      };
    }

    // 3. Trend Continuation Risk (Grinding Up):
    // If the coin is not yet overextended (priceNorm < 0.85) but is moving up slowly (> 8 hours),
    // it's likely a sustainable trend or recovery, not a spike to short.
    if (
      features.targetCoin.currentPriceNorm < 0.85 &&
      features.targetCoin.velocityMove > windowsMs["1h"] * 8
    ) {
      return {
        entry: false,
        probability: 0,
        label: "TOP HARD: C. Trend Grind Risk (Mid-Range & Slow Velocity)",
        reasons: ["TOP HARD: C. Trend Grind Risk (Mid-Range & Slow Velocity)"],
      };
    }

    return {
      entry: true,
      probability: 1,
      label: "TOP HARD: C. Alert Entry",
      reasons: ["TOP HARD: C. Alert Entry"],
    };
  }

  // D. LEVEL 3
  if (features.currentPoint.lvl == 3) {
    const prob = classifyObjectScore(features, rulesLevel3);
    if (prob > 0.6) {
      if (
        features.btc.downRatio > 0 &&
        features.btc.lastBTCVolatilityPoint?.lvl !== 1 &&
        // features.targetCoin.velocityMove > windowsMs["1h"] * 7
        features.market.levelThreshold.minBottom <= -2
      ) {
        return {
          entry: true,
          probability: prob,
          label: "TOP HARD: D. Danger Entry",
          reasons: ["TOP HARD: D. Danger Entry"],
        };
      }
    }

    return {
      entry: false,
      probability: 0,
      label: "TOP HARD: D. Danger Entry",
      reasons: ["TOP HARD: D. Danger Entry"],
    };
  }

  return {
    entry: false,
    probability: 0,
    label: "No entry",
    reasons: ["TOP HARD: No conditions met for top hard entry"],
  };
}
