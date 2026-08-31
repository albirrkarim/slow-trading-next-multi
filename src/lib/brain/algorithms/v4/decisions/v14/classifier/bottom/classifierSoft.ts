import moment from "moment-timezone";
import { type Features } from "../../feature";
import { type ClassifierReturn } from "../type";
import { mapScaleValue } from "../utils";
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";

/**
 * BOTTOM classifier (soft/flexible conditions) for decision engine v10.
 *
 * This classifier uses more relaxed entry criteria compared to classifierHard,
 * designed to capture additional profitable opportunities while managing risk.
 *
 * **Strategy Focus:**
 * - Ensures monthly profitability through flexible entries
 * - Scales requirements based on BTC market conditions
 * - Adjusts level thresholds dynamically using down ratio
 * - Considers seasonal patterns (months 11-3 have different rules)
 *
 * **Key Features:**
 * - Dynamic level scaling: mapScaleValue(0, 0.5, downRatio, -3, -5)
 * - BTC correlation analysis: enters when BTC leads market up
 * - Mean level proximity: enters near historical average volatility level
 * - Anomaly coin handling: XRP, SUI, AAVE have stricter rules
 *
 * **Level Interpretation:**
 * - More negative = stronger buy signal
 * - Soft typically enters at -2 to -5 depending on conditions
 *
 * Ensuring monthly profit
 * Created 03 Dec 2025
 * Updated 06 Dec 2025
 *
 * @param {Features} features - Extracted market features including trading history and sensitive metrics.
 * @returns {ClassifierReturn} Decision with entry flag, probability (0-1), descriptive label, and reasons array.
 *
 * @example
 * const features = getFeatures({ currentPoint, modelMemoryMap, ... });
 * const decision = classifierSoft(features);
 * if (decision.entry) {
 *   console.log(`Soft entry: ${decision.label} (probability: ${decision.probability})`);
 *   // Execute trade with confidence = decision.probability
 * } else {
 *   console.log(`Soft rejected: ${decision.reasons.join("; ")}`);
 * }
 */
export function classifierSoft(features: Features): ClassifierReturn {
  const {
    currentPoint,
    targetCoin,
    btc,
    comparative,
    market,
    trading,
    sensitive,
  } = features;
  const { downRatio, currentPriceNorm } = targetCoin;
  const {
    currentPriceNorm: currentBTCPriceNorm,
    downRatio: downRatioBTC,
    lastBTCVolatilityPoint,
  } = btc;
  const { diffWithBTC } = comparative;
  const { globalVolatilityIndex } = market;

  const { numberOfProfitTrades } = trading;

  const reasons: string[] = [];

  const isAnomalyCoin = ["XRP", "SUI", "AAVE"].includes(
    currentPoint.symbol ?? ""
  );

  // A. BTC is up significantly, so other coin will likely up
  if (downRatioBTC < 0.2) {
    // A.1 when btc is up, other coin must be also up
    if (currentPoint.lvl <= -3 && currentPriceNorm.c > 0.05 && features.targetCoin.downRatio < 0.8) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: A.1 when btc is up, other coin must be also up",
        reasons: [],
      };
    } else {
      // A.2 when the level is near mean level, we can consider to enter
      if (Math.abs(currentPoint.lvl - targetCoin.meanLevel) < 1) {
        return {
          entry: currentPoint.lvl <= (isAnomalyCoin ? -3 : -2),
          probability: 1,
          label:
            "SOFT: A.2 when the level is near mean level, we can consider to enter",
          reasons: [],
        };
      } else {
        reasons.push(
          `SOFT: rejected A.2 level ${currentPoint.lvl} is not near mean level ${targetCoin.meanLevel}`
        );
      }
    }
  } else {
    reasons.push(
      `SOFT: rejected A. BTC is not up significantly, downRatioBTC: ${downRatioBTC}`
    );
  }

  // B. Instead of hard entry -4, we scale it based on down ratio
  const minLevelA = parseInt(
    mapScaleValue(0, 0.5, downRatio, -3, -5).toString()
  );

  if (currentPoint.lvl <= minLevelA && minLevelA <= -3) {
    return {
      entry: true,
      probability: 1,
      label:
        "SOFT: B. Instead of hard entry -4, we scale it based on down ratio",
      reasons: [],
    };
  } else {
    reasons.push(
      `SOFT: rejected B. level ${currentPoint.lvl} > minLevelA ${minLevelA}`
    );
  }

  const month = moment(currentPoint.t).utc().month() + 1;

  // C. only if the month is 11-03
  if (currentPoint.symbol !== "XLM") {
    if (month >= 11 || month <= 3) {
      // C.1 weaken the entry level case A
      if (
        currentPoint.lvl == -2 &&
        currentBTCPriceNorm > 0.5 &&
        currentPriceNorm.c < 0.3 &&
        downRatioBTC < 0.5
      ) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: C.1 weaken the entry level case A",
          reasons: [],
        };
      } else {
        reasons.push(`
        SOFT: C.1 rejected currentPoint.lvl ${currentPoint.lvl} != -2 or
        currentBTCPriceNorm ${currentBTCPriceNorm.toFixed(2)} <= 0.5 or
        currentPriceNorm ${currentPriceNorm.c.toFixed(2)} >= 0.3 or
        downRatioBTC ${downRatioBTC.toFixed(2)} >= 0.5
        `);
      }

      let minLevelB = (isAnomalyCoin ? -4 : -3)

      if (features.targetCoin.downRatio > 0.8) {
        minLevelB = -4
      }

      if (
        // C.2 weaken the entry level case B
        currentPoint.lvl <= minLevelB &&
        currentBTCPriceNorm > 0.4 &&
        currentPriceNorm.c > 0.4 &&
        currentBTCPriceNorm > currentPriceNorm.c
      ) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: C.2 weaken the entry level case B",
          reasons: [],
        };
      } else {
        reasons.push(`
        SOFT: C.2 rejected currentPoint.lvl ${currentPoint.lvl} > ${minLevelB} or
        currentBTCPriceNorm ${currentBTCPriceNorm.toFixed(2)} <= 0.4 or
        currentPriceNorm.c ${currentPriceNorm.c.toFixed(
          2
        )} <= 0.4 or
        currentBTCPriceNorm ${currentBTCPriceNorm.toFixed(
          2
        )} <= currentPriceNorm.c ${currentPriceNorm.c.toFixed(2)}
        `);
      }
    } else {
      reasons.push(
        `SOFT: C. rejected only if the month is 11-03, current month is ${month}`
      );
    }
  } else {
    reasons.push(`SOFT: C. rejected XLM is excluded from this rule`);
  }

  // My astrological consideration for October and November
  if (month == 10 || month == 11) {
    if (currentPoint.lvl <= -3 && btc.downRatio < 0.8) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: D. Astrological consideration for October and November",
        reasons: [],
      };
    } else {
      reasons.push(`
        SOFT: D. Astrological consideration rejected level ${currentPoint.lvl} is not <= -3
      `);
    }
  } else {
    reasons.push(`
        SOFT: D. Astrological consideration rejected month is not 10 or 11, current month is ${month}
    `);
  }

  if (month == 1) {
    if (currentPoint.lvl <= -3 && diffWithBTC > 0) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: E. Try to always profit in January",
        reasons: [],
      };
    } else {
      reasons.push(`
      SOFT: E. rejected level ${currentPoint.lvl} <= -3 or ${diffWithBTC} <= 0
    `);
    }
  } else {
    reasons.push(`
      SOFT: E. rejected not January month, current month is ${month}
    `);
  }

  if (
    month == 11 &&
    currentPoint.symbol !== "ADA" &&
    currentPoint.symbol !== "XLM"
  ) {
    if (currentPoint.lvl <= -2 && diffWithBTC > 0 && btc.downRatio < 0.8) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: F. Try to always profit in November ",
        reasons: [],
      };
    } else {
      reasons.push(`
        SOFT: F. rejected level is not <= -2 Current level Is ${currentPoint.lvl} or diffWithBTC <= 0, diffWithBTC: ${diffWithBTC}
      `);
    }
  } else {
    reasons.push(`
      SOFT: F. rejected not November month or excluded coin ADA/XLM, current month is ${month}, coin: ${currentPoint.symbol}
    `);
  }

  if (month == 4) {
    if (currentPoint.lvl <= -4) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: G. Try to always profit in April",
        reasons: [],
      };
    } else {
      reasons.push(`
        SOFT: G. rejected level is not <= -4 Current level Is ${currentPoint.lvl}
      `);
    }
  } else {
    reasons.push(`
      SOFT: G. rejected not April month, current month is ${month}
    `);
  }

  const currentDate = new Date(currentPoint.t);
  const date = currentDate.getUTCDate();

  // H, I, J. Ensure profit if not enough profit this month
  if (numberOfProfitTrades <= 2) {
    // Must profit end of the month

    if (date > 20 && numberOfProfitTrades == 0) {
      if (currentPoint.lvl <= -3) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: H. Ensure profit this month after 20th",
          reasons: [],
        };
      } else {
        reasons.push(`
          SOFT: H. rejected, level ${currentPoint.lvl} > -3
        `);
      }
    } else {
      reasons.push(`
        SOFT: H. rejected enough profit trades this month: ${numberOfProfitTrades} or date ${date} <= 20
      `);
    }

    if (date > 25 && numberOfProfitTrades <= 1) {

      let minLevelC = -2

      if (features.targetCoin.downRatio > 0.5) {
        minLevelC = -3
      }

      if (currentPoint.lvl <= minLevelC) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: I. Ensure profit this month after 25th ",
          reasons: [],
        };
      } else {
        reasons.push(`
          SOFT: I. rejected, level ${currentPoint.lvl} > ${minLevelC}
        `);
      }
    } else {
      reasons.push(`
        SOFT: I. rejected enough profit trades this month: ${numberOfProfitTrades} or date ${date} <= 25
      `);
    }

    if (date > 25 && numberOfProfitTrades <= 1 && downRatioBTC < 0.5) {
      let minLevelD = -1

      if (features.targetCoin.downRatio > 0.5) {
        minLevelD = -3
      }

      if (currentPoint.lvl <= minLevelD) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: J. Ensure profit this month after 25th with btc up",
          reasons: [],
        };
      } else {
        reasons.push(`
          SOFT: J. rejected, level ${currentPoint.lvl} > ${minLevelD}
        `);
      }
    } else {
      reasons.push(`
        SOFT: J. rejected enough profit trades this month: ${numberOfProfitTrades} or date ${date} <= 25 or downRatioBTC ${downRatioBTC.toFixed(
        2
      )} >= 0.5
      `);
    }
  } else {
    reasons.push(`
      SOFT: H,I,J. rejected enough profit trades this month: ${numberOfProfitTrades}
    `);
  }

  // Must profit begining of the month
  if (numberOfProfitTrades <= 5 && lastBTCVolatilityPoint) {
    if (date <= 20) {
      // check is the lastBTCVolatilityPoint is more than 3 days ago
      if (
        currentPoint.t - lastBTCVolatilityPoint.t > windowsMs["1d"] * 7 &&
        globalVolatilityIndex < 0.3 &&
        currentPoint.lvl <= -2
      ) {
        return {
          entry: true,
          probability: 1,
          label: "SOFT: K. Ensure profit at beginning of the month",
          reasons: [],
        };
      } else {
        const durationDays = moment
          .duration(currentPoint.t - lastBTCVolatilityPoint.t)
          .asDays();

        reasons.push(`
          SOFT: K. rejected lastBTCVolatilityPoint is too recent ${durationDays.toFixed(
          2
        )} days ago or GVI ${globalVolatilityIndex.toFixed(
          2
        )} >= 0.3 or level ${currentPoint.lvl} > -2
        `);
      }
    } else {
      reasons.push(`
        SOFT: K. rejected date ${date} > 20
      `);
    }
  } else {
    reasons.push(`
      SOFT: K. rejected enough profit trades this month: ${numberOfProfitTrades}
    `);
  }

  // try to trading on 1 0 -1 level
  if (sensitive.minLevel > 0) {
    if (currentPoint.lvl <= 0) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: L. Try trading on 1 0 -1 level when market is stable",
        reasons: [],
      };
    } else {
      reasons.push(`
        SOFT: L. rejected currentPoint.lvl ${currentPoint.lvl} > 0
      `);
    }
  } else {
    reasons.push(`
      SOFT: L. rejected sensitive.minLevel ${sensitive.minLevel} <= 0
    `);
  }

  if (numberOfProfitTrades == 1) {
    if (currentPoint.lvl <= -2 && date >= 25) {
      return {
        entry: true,
        probability: 1,
        label: "SOFT: M. Ensure second profit at end of the month",
        reasons: [],
      };
    } else {
      reasons.push(`
        SOFT: M. rejected currentPoint.lvl ${currentPoint.lvl} > -2 or date ${date} < 25
      `);
    }
  } else {
    reasons.push(`
      SOFT: M. rejected numberOfProfitTrades ${numberOfProfitTrades} != 1
    `);
  }

  if (
    currentPoint.lvl > market.levelThreshold.minBottom &&
    currentPoint.lvl < market.levelThreshold.meanBottom &&
    Math.abs(
      market.levelThreshold.meanBottom - market.levelThreshold.minBottom
    ) < 1.5
  ) {
    const notTooVolatile =
      Math.abs(
        market.levelThreshold.meanTop -
        Math.abs(market.levelThreshold.meanBottom)
      ) <= 3;

    let minLevelThreshold = notTooVolatile ? -1 : -2;

    if (currentPoint.lvl == -1) {
      if (
        market.globalVolatilityIndex > 0.4 || // too volatile market
        Math.abs(1 - Math.abs(market.levelThreshold.meanBottom)) >= 0.2 || // mean bottom too far from -1
        targetCoin.velocityDownTime < windowsMs["1h"] * 8 || // coin is falling fast
        diffWithBTC < 0.1 || // btc is not leading
        market.levelThreshold.mean > 0
      ) {
        minLevelThreshold = -2;
      }
    }

    // adjust based on down ratio
    if (targetCoin.downRatio > 0.6) {
      minLevelThreshold = Math.min(
        mapScaleValue(0.6, 1, targetCoin.downRatio, -3, -4),
        minLevelThreshold
      );
    }

    // if (market.globalVolatilityIndex > 0.6) {
    //   minLevelThreshold = Math.min(-3, minLevelThreshold);
    // }

    if (currentPoint.lvl <= minLevelThreshold) {
      return {
        entry: true,
        probability: 1,
        label: `SOFT: N. level ${currentPoint.lvl} in un volatile market`,
        reasons: [],
      };
    }
  }

  return {
    entry: false,
    probability: 0,
    label: "No entry",
    reasons,
  };
}
