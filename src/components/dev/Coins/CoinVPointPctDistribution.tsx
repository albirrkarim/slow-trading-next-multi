"use client";

import VPointPctDistribution from "@/components/ui/VPointPctDistribution";
import type { CoinFinderRange } from "@/lib/devBacktest/coins/types";
import type { VolatilityPoint } from "@/lib/dynamic";

/** Backtest coin-table adapter for the shared vPoint distribution. */
export default function CoinVPointPctDistribution({
  points,
  range,
}: {
  points: VolatilityPoint[];
  range: CoinFinderRange;
}) {
  return <VPointPctDistribution points={points} rangeLabel={range} />;
}
