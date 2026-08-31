import type { TradingModelConfig } from "@/lib/trading/models";

interface MonthRangedTradingModelConfig extends TradingModelConfig {
    startMonth: number;
    endMonth: number;
}

export function monthFromMs(ms: number, useUTC = true): number {
    const d = new Date(ms);
    return (useUTC ? d.getUTCMonth() : d.getMonth()) + 1;
}

export type MonthToSeasonMap = (number | null)[]; // index 1..12 used, but stored at 1..12 (0 unused)

/**
 * Normalize month to 1..12
 */
function normMonth(m: number): number {
    if (!Number.isFinite(m)) throw new Error("month must be a number");
    const n = ((Math.floor(m) - 1) % 12) + 1;
    return n <= 0 ? n + 12 : n;
}

/**
 * Check whether month (1..12) is inside a season (wrap-around allowed).
 * startMonth and endMonth are inclusive.
 */
export function isMonthInSeason(
    month: number,
    startMonth: number,
    endMonth: number
): boolean {
    month = normMonth(month);
    startMonth = normMonth(startMonth);
    endMonth = normMonth(endMonth);

    if (startMonth <= endMonth) {
        return month >= startMonth && month <= endMonth;
    } else {
        // wrap-around: e.g. 10..2 -> months 10,11,12,1,2
        return month >= startMonth || month <= endMonth;
    }
}

/**
 * Build mapping month -> seasonIndex (index into seasonalConfigs)
 * - returns array length 13 where index 1..12 map to season index (0-based) or null if not covered
 * - throws if overlap detected (two seasons claim same month)
 */
export function buildMonthToSeasonMap(
    seasonalConfigs: MonthRangedTradingModelConfig[]
): MonthToSeasonMap {
    const map: MonthToSeasonMap = Array(13).fill(null); // 0 unused, 1..12 months
    seasonalConfigs.forEach((s, idx) => {
        const { startMonth, endMonth } = s;
        for (let m = 1; m <= 12; m++) {
            if (isMonthInSeason(m, startMonth, endMonth)) {
                if (map[m] !== null) {
                    const conflictIdx = map[m]!;
                    throw new Error(
                        `Overlapping seasonal config: month ${m} is claimed by both index ${conflictIdx} and ${idx}`
                    );
                }
                map[m] = idx;
            }
        }
    });
    return map;
}

/**
 * Optional validator to ensure every month is covered by at least one season.
 * Returns false or throws depending on preferThrow.
 */
export function validateSeasonalConfig(
    seasonalConfigs: MonthRangedTradingModelConfig[],
    preferThrow = true
): boolean {
    const map = buildMonthToSeasonMap(seasonalConfigs);
    const missing = [];
    for (let m = 1; m <= 12; m++) {
        if (map[m] === null) missing.push(m);
    }
    if (missing.length > 0) {
        const msg = `Some months are not covered by seasonalConfig: ${missing.join(
            ", "
        )}`;
        if (preferThrow) throw new Error(msg);
        return false;
    }
    return true;
}

/**
 * Fast lookup: get season config index for a given month (1..12).
 * Returns index (0..n-1) or null if none.
 */
export function findSeasonIndexForMonth(
    month: number,
    monthToSeason: MonthToSeasonMap
): number | null {
    const m = normMonth(month);
    return monthToSeason[m] ?? null;
}

/**
 * Convenience: given timestamp in ms, return the associated season config (or null)
 */
export function getSeasonForMs(
    ms: number,
    seasonalConfigs: MonthRangedTradingModelConfig[],
    monthToSeason?: MonthToSeasonMap,
    useUTC = true
): MonthRangedTradingModelConfig | null {
    const month = monthFromMs(ms, useUTC); // expects 1..12
    const map = monthToSeason ?? buildMonthToSeasonMap(seasonalConfigs);
    const idx = findSeasonIndexForMonth(month, map);
    return idx === null ? null : seasonalConfigs[idx];
}
