import { type BacktestReturnDynamic } from "@/lib/dynamic";
import { type GetIncomePerMonthReturn } from "../stability";

import { type GrowthOvertimeDetail } from "../../../dynamic/backtest-volatility/type";
import type { ValueRange } from "./type-dynamic-report";

export function computeMonthlyGain(
  backtestReturn: BacktestReturnDynamic,
  stability: GetIncomePerMonthReturn
) {
  // --- Helpers --------------------------------------------------------

  const monthKeyFromMs = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  const monthStartMs = (year: number, monthIndex0: number) =>
    Date.UTC(year, monthIndex0, 1);

  const totalAssetFromPoint = (p: GrowthOvertimeDetail): number =>
    p.currentAsset;

  const extractTime = (pt: GrowthOvertimeDetail): number => pt.timeMs;

  const findStartingAssetForMonth = (
    monthStart: number,
    nextMonthStart: number,
    growthSorted: GrowthOvertimeDetail[]
  ): number | null => {
    for (const pt of growthSorted) {
      const t = extractTime(pt);
      if (t >= monthStart && t < nextMonthStart) return totalAssetFromPoint(pt);
    }

    let lastBefore: any = null;
    for (const pt of growthSorted) {
      const t = extractTime(pt);
      if (t < nextMonthStart) lastBefore = pt;
      else break;
    }

    return lastBefore ? totalAssetFromPoint(lastBefore) : null;
  };

  // --- Step 1: Sort growth -------------------------------------------

  const growth = [...(backtestReturn.backtestPack.growthOvertime || [])].sort(
    (a, b) => extractTime(a) - extractTime(b)
  );

  const startingBalance = backtestReturn.startingBalanceUSDT ?? 0;

  // --- Step 2: Build monthly profit map ------------------------------

  const tradeHistoryMap = backtestReturn.backtestPack.tradeHistoryMap || {};
  const monthlyProfits: Record<string, number> = {};

  for (const symbol of Object.keys(tradeHistoryMap)) {
    for (const t of tradeHistoryMap[symbol]) {
      if ((t.side ?? "").toUpperCase() !== "SELL") continue;

      const time = t.time;

      const key = monthKeyFromMs(time);
      const profit = Number(t.profit ?? 0);

      monthlyProfits[key] = (monthlyProfits[key] ?? 0) + profit;
    }
  }

  // --- Step 3: All months we need to consider ------------------------

  const monthsSet = new Set<string>(Object.keys(monthlyProfits));

  for (const pt of growth) {
    monthsSet.add(monthKeyFromMs(extractTime(pt)));
  }

  const months = [...monthsSet].sort();

  // --- Step 4: Compute monthly % -------------------------------------

  const percents: number[] = [];

  for (const key of months) {
    const [yStr, mStr] = key.split("-");
    const y = Number(yStr);
    const m0 = Number(mStr) - 1;

    const start = monthStartMs(y, m0);
    const next = monthStartMs(y + (m0 === 11 ? 1 : 0), m0 === 11 ? 0 : m0 + 1);

    let starting = findStartingAssetForMonth(start, next, growth);
    if (!starting || starting === 0) starting = startingBalance;
    if (!starting || starting === 0) continue;

    const profit = monthlyProfits[key] ?? 0;
    const pct = (profit / starting) * 100;

    percents.push(pct);
  }

  // --- Step 5: Return ValueRange -------------------------------------

  if (percents.length === 0) {
    const avgPct =
      startingBalance > 0 && stability?.avgMonthlyProfit
        ? (stability.avgMonthlyProfit / startingBalance) * 100
        : 0;

    return { min: avgPct, avg: avgPct, max: avgPct };
  }

  const sum = percents.reduce((a, b) => a + b, 0);

  return {
    min: Math.min(...percents),
    avg: sum / percents.length,
    max: Math.max(...percents),
    percents,
  } satisfies ValueRange;
}
