"use client";

import { type DynamicTradeBacktestReturn } from "@/components/api/dynamic/api-dynamic-type";
import { Grid, Typography } from "@mui/material";
import BarChartMeanHolding from "../../Evaluation/BarChartMeanHolding";
import MonthlyProfitReport from "../../Evaluation/MonthlyProfitReport";
import PassiveIncomeReport from "../../Evaluation/PassiveIncomeReport";
import TradingPerformanceReport from "../../Evaluation/TradingPerformanceReport";
import AssetPieChart from "./Pie";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import ExitReasonTradeChips from "./ExitReasonTradeChips";

/** Counts profitable and losing closed trades for each coin. */
function buildCoinOutcomeMetrics(
    tradeHistory: DynamicTradeBacktestReturn["tradeHistory"],
) {
    const outcomeStats: Record<string, { losses: number; wins: number }> = {};

    for (const trade of tradeHistory) {
        if (trade.netProfitUSDT === 0) {
            continue;
        }

        const stats = outcomeStats[trade.symbol] ?? { losses: 0, wins: 0 };
        if (trade.netProfitUSDT > 0) {
            stats.wins++;
        } else {
            stats.losses++;
        }
        outcomeStats[trade.symbol] = stats;
    }

    const profitableCounts = Object.fromEntries(
        Object.entries(outcomeStats).map(([symbol, stats]) => [
            symbol,
            stats.wins,
        ]),
    );

    return { outcomeStats, profitableCounts };
}

/** Counts closed trades by their normalized exit reason. */
function buildExitReasonCounts(
    tradeHistory: DynamicTradeBacktestReturn["tradeHistory"],
) {
    const counts: Record<string, number> = {};

    for (const trade of tradeHistory) {
        const reason = (trade.exitReason ?? "UNKNOWN").replaceAll("_", " ");
        counts[reason] = (counts[reason] ?? 0) + 1;
    }

    return counts;
}

function EvaluationChartSection({
    children,
    title,
}: {
    children: React.ReactNode;
    title: string;
}) {
    return (
        <HeaderMetrics
            defaultExpanded={false}
            headerCanBeClicked
            headerSx={{ py: 0.75, borderBottom: 1, borderColor: "divider" }}
            sx={{ mb: 1 }}
            title={
                <Typography variant="body2" fontWeight={700}>
                    {title}
                </Typography>
            }
        >
            {(expanded) => expanded && children}
        </HeaderMetrics>
    );
}

export default function DebugEvaluation({
    data,
}: {
    data: DynamicTradeBacktestReturn;
}) {
    const coinOutcomeMetrics = buildCoinOutcomeMetrics(data.tradeHistory);
    const exitReasonCounts = buildExitReasonCounts(data.tradeHistory);

    return (
        <>
            <EvaluationChartSection title="Positions performance">
                <BarChartMeanHolding
                    data={data.evaluation.positionPerformance ?? []}
                    height={280}
                />
            </EvaluationChartSection>

            <Grid
                aria-label="Trade analysis pie charts"
                container
                spacing={1}
                sx={{ mb: 1 }}
            >
                <Grid size={{ xs: 12, md: 4 }}>
                    <EvaluationChartSection title="Total trades by coin">
                        <AssetPieChart
                            ariaLabel="Total trades by coin pie chart"
                            dataObject={data.tradeCountMap}
                        />
                    </EvaluationChartSection>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <EvaluationChartSection title="Profit count by coin">
                        <AssetPieChart
                            ariaLabel="Profit count by coin pie chart"
                            dataObject={coinOutcomeMetrics.profitableCounts}
                            outcomeStats={coinOutcomeMetrics.outcomeStats}
                        />
                    </EvaluationChartSection>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <EvaluationChartSection title="Exit reason count">
                        <>
                            <AssetPieChart
                                ariaLabel="Exit reason count pie chart"
                                dataObject={exitReasonCounts}
                            />
                            <ExitReasonTradeChips
                                stability={data.evaluation.stability}
                                tradeHistory={data.tradeHistory}
                            />
                        </>
                    </EvaluationChartSection>
                </Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid size={6}>
                    <TradingPerformanceReport perf={data.evaluation.performance} />
                </Grid>
                <Grid size={6}>
                    <PassiveIncomeReport metrics={data.evaluation.passive} />
                </Grid>
            </Grid>

            <MonthlyProfitReport stability={data.evaluation.stability} />
        </>
    );
}
