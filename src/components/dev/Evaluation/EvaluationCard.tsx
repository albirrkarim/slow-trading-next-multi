import { Button, Grid } from "@mui/material";
import TradingPerformanceReport from "./TradingPerformanceReport";
import PassiveIncomeReport from "./PassiveIncomeReport";
import MonthlyProfitReport from "./MonthlyProfitReport";
import type {
    GetIncomePerMonthReturn,
    PassiveIncomeMetrics,
    TradingPerformance,
} from "@/lib/evaluate";
import type { Aggregated } from "@/lib/evaluate/analysis/volatility";
import HeaderMetrics from "./HeaderMetrics";
import BarChartMeanHolding from "./BarChartMeanHolding";

interface EvaluationCardProps {
    performance: TradingPerformance;
    passive: PassiveIncomeMetrics;
    stability: GetIncomePerMonthReturn;
    positionPerformance: Aggregated[];
}

export default function EvaluationCard({
    performance,
    passive,
    stability,
    positionPerformance,
}: EvaluationCardProps) {
    return (
        <>
            <Grid sx={{ my: 2 }} container spacing={2}>
                <Grid size={6}>
                    <TradingPerformanceReport perf={performance} />
                </Grid>
                <Grid size={6}>
                    <PassiveIncomeReport metrics={passive} />
                </Grid>
            </Grid>

            <MonthlyProfitReport stability={stability} />

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit">
                        Positions Peformance
                    </Button>
                }
            >
                {(expand) => (
                    <>{expand && <BarChartMeanHolding data={positionPerformance} />}</>
                )}
            </HeaderMetrics>
        </>
    );
}
