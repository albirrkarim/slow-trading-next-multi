import _ from "lodash";
import type { Position } from "@/lib/trading/models";

export interface Aggregated {
  key: number;
  unit: "minutes" | "hours" | "days" | "months" | "years";
  time: string;
  totalNetProfitUSDT: number;
  avgPercent: number;
  frequency: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Groups closed positions by their canonical hold duration.
 */
export function aggregatePositions(positions: Position[]): Aggregated[] {
  const grouped = _.groupBy(positions, (p) => {
    const durationMs = Math.max(0, (p.closed?.t ?? p.opened.t) - p.opened.t);

    if (durationMs < HOUR_MS) {
      return `i-${Math.round(durationMs / MINUTE_MS)}`;
    }

    if (durationMs < DAY_MS) {
      return `h-${Math.round(durationMs / HOUR_MS)}`;
    }

    const days = Math.round(durationMs / DAY_MS);
    if (days < 30) {
      return `d-${days}`;
    }

    if (days < 365) {
      const months = Math.round(days / 30);
      return `m-${months}`;
    }

    const years = Math.round(days / 365);
    return `y-${years}`;
  });

  const result: Aggregated[] = Object.entries(grouped).map(([bucket, arr]) => {
    const prefix = bucket[0];
    const num = parseInt(bucket.slice(2), 10);

    const totalNetProfitUSDT = _.sumBy(arr, (position) => position.pnl.netUsdt ?? 0);
    const avgPercent = _.meanBy(arr, (position) => position.pnl.netPct ?? 0) ?? 0;
    const frequency = arr.length;

    let unit: Aggregated["unit"];
    let time: string;
    if (prefix === "i") {
      unit = "minutes";
      time = `${num} ${num === 1 ? "minute" : "minutes"}`;
    } else if (prefix === "h") {
      unit = "hours";
      time = `${num} ${num === 1 ? "hour" : "hours"}`;
    } else if (prefix === "d") {
      unit = "days";
      time = `${num} ${num === 1 ? "day" : "days"}`;
    } else if (prefix === "m") {
      unit = "months";
      time = `${num} ${num === 1 ? "month" : "months"}`;
    } else {
      unit = "years";
      time = `${num} ${num === 1 ? "year" : "years"}`;
    }

    return { key: num, unit, time, totalNetProfitUSDT, avgPercent, frequency };
  });

  const unitOrder: Record<Aggregated["unit"], number> = {
    minutes: 0,
    hours: 1,
    days: 2,
    months: 3,
    years: 4,
  };

  return _.sortBy(result, [
    (item) => unitOrder[item.unit],
    "key",
  ]);
}
