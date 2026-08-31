import { type BacktestReturnDynamic } from "@/lib/dynamic";
import {
    getIncomePerMonth,
    type GetIncomePerMonthReturn,
    getTradingPerformance,
    type PassiveIncomeMetrics,
    passiveIncomeMetrics,
    type TradingPerformance,
} from "@/lib/evaluate";
import { type Aggregated, aggregatePositions } from "@/lib/evaluate/analysis/volatility";
import { type TradeHistory } from "@/lib/dynamic/backtest-volatility/type";
import { type Position } from "@/lib/trading/models";

export interface CommonEvaluation {
    performance: TradingPerformance
    stability: GetIncomePerMonthReturn
    passive: PassiveIncomeMetrics
    positionPerformance: Aggregated[]
}

export function commonEvaluation(
    symbols: string[],
    cached: BacktestReturnDynamic
): CommonEvaluation {
    const tradeHistory = symbols
        .map((symbol: string) => cached.backtestPack.tradeHistoryMap[symbol] ?? [])
        .flat() as TradeHistory[];

    tradeHistory.sort((a, b) => a.time - b.time);

    const positionsSell = symbols
        .map(
            (symbol: string) =>
                cached.backtestPack.modelMemoryMap[symbol]?.positionsSell ?? []
        )
        .flat() as Position[];

    positionsSell.sort((a, b) => a.opened.t - b.opened.t);

    const performance = getTradingPerformance(tradeHistory);

    const stability = getIncomePerMonth(tradeHistory);

    const passive = passiveIncomeMetrics(tradeHistory);

    const positionPerformance = aggregatePositions(positionsSell);

    return {
        performance,
        stability,
        passive,
        positionPerformance,
    };
}
