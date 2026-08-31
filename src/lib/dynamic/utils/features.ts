import { type VolatilityPoint } from "./volatility";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days in ms

export function volatilitySnapshot(
  currentTimeMs: number,
  volatilityPointsMap: Record<string, VolatilityPoint[]> = {}
) {
  const cutoff = currentTimeMs - ONE_MONTH_MS;

  const allPoints: VolatilityPoint[] =
    Object.values(volatilityPointsMap).flat();

  const allPointsOneMonth: VolatilityPoint[] = allPoints.filter(
    (k) => k.t >= cutoff
  );

  return analyzeVolatilityPoints(allPointsOneMonth);
}

/**
 * Analyze volatility level distribution and compute adjusted averages.
 *
 * ## Algorithm
 * 1. Count raw occurrences of each volatility `level`.
 * 2. Adjust the counts into a new `levelMap`:
 *    - `level = 0` stays unchanged.
 *    - For **positive levels**, subtract the count of the next higher level.
 *      e.g. `count(2)` → `count(2) - count(3)`
 *    - For **negative levels**, subtract the count of the next closer-to-zero level.
 *      e.g. `count(-2)` → `count(-2) - count(-3)`
 * 3. Compute average positive (`averageLevelTop`) and negative (`averageLevelBottom`)
 *    levels weighted by their adjusted counts.
 *
 * ## Example
 * Input:
 * ```json
 * { "3": 2, "2": 5, "1": 20, "0": 90, "-1": 40, "-2": 15, "-3": 5 }
 * ```
 *
 * After adjustment:
 * ```json
 * { "3": 2, "2": 3, "1": 13, "0": 90, "-1": 20, "-2": 10, "-3": 5 }
 * ```
 *
 * @param {VolatilityPoint[]} points - Array of volatility points.
 * @returns {{
 *   averageLevelTop: number,
 *   averageLevelBottom: number,
 *   levelMap: Record<number, number>
 * }} The adjusted level map and the average top/bottom levels.
 */
function analyzeVolatilityPoints(points: VolatilityPoint[]) {
  if (!points.length) {
    return {
      averageLevelTop: 0,
      averageLevelBottom: 0,
      levelMap: {},
    };
  }

  // 1️⃣ Count raw occurrences
  const rawMap: Record<number, number> = {};
  for (const p of points) {
    rawMap[p.lvl] = (rawMap[p.lvl] ?? 0) + 1;
  }

  // 2️⃣ Adjust counts (produce levelMap)
  const levels = Object.keys(rawMap)
    .map(Number)
    .sort((a, b) => a - b);

  const levelMap: Record<number, number> = {};
  levelMap[0] = rawMap[0] ?? 0;

  // Positive levels: process from highest to lowest
  const keysTop = levels.filter((e) => e > 0).sort((a, b) => b - a);

  // Negative levels: process from lowest to highest
  const keysBottom = levels.filter((e) => e < 0).sort((a, b) => a - b);

  // Adjust positive side (3 → 2 → 1)
  for (const level of keysTop) {
    levelMap[level] = rawMap[level] ?? 0;
    if (level > 1) {
      const current = rawMap[level] ?? 0;
      levelMap[level - 1] = Math.max(0, (rawMap[level - 1] ?? 0) - current);
    }
  }

  // Adjust negative side (-3 → -2 → -1)
  for (const level of keysBottom) {
    levelMap[level] = rawMap[level] ?? 0;
    if (level < -1) {
      const current = rawMap[level] ?? 0;
      levelMap[level + 1] = Math.max(0, (rawMap[level + 1] ?? 0) - current);
    }
  }

  // 3️⃣ Compute averages using adjusted map
  let totalLevelTop = 0;
  let totalLevelBottom = 0;
  let countTop = 0;
  let countBottom = 0;

  for (const [levelStr, count] of Object.entries(levelMap)) {
    const level = Number(levelStr);
    if (level > 0) {
      totalLevelTop += level * count;
      countTop += count;
    } else if (level < 0) {
      totalLevelBottom += level * count;
      countBottom += count;
    }
  }

  const averageLevelTop = parseFloat(
    (countTop > 0 ? totalLevelTop / countTop : 0).toFixed(2)
  );
  const averageLevelBottom = parseFloat(
    (countBottom > 0 ? totalLevelBottom / countBottom : 0).toFixed(2)
  );

  return { averageLevelTop, averageLevelBottom, levelMap };
}
