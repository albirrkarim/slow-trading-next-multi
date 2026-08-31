"use client";

import { type PassiveIncomeMetrics } from "@/lib/evaluate/analysis/passive";
import EnergySavingsLeafIcon from "@mui/icons-material/EnergySavingsLeaf";
import {
    Card,
    CardContent,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@mui/material";
import ButtonTooltip from "../../ui/ButtonTooltip";
import HeaderMetrics from "./HeaderMetrics";
import IconButtonTooltip from "../../ui/IconButtonTooltip";

interface Props {
    metrics: PassiveIncomeMetrics;
}

export default function PassiveIncomeReport({ metrics }: Props) {
    const humanizeDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes.toFixed(0)} min`;
        const hours = minutes / 60;
        if (hours < 24) return `${hours.toFixed(1)} hrs`;
        return `${(hours / 24).toFixed(1)} days`;
    };

    return (
        <HeaderMetrics
            title={
                <>
                    <IconButtonTooltip size="small" tooltipTitle="Passive Income">
                        <EnergySavingsLeafIcon />
                    </IconButtonTooltip>

                    <ButtonTooltip tooltipTitle="Total Months">
                        {metrics.totalMonths}
                    </ButtonTooltip>

                    <ButtonTooltip tooltipTitle="Profitable Months">
                        {metrics.percentProfitableMonths.toFixed(2)}%
                    </ButtonTooltip>

                    <ButtonTooltip tooltipTitle={<>
                        Avg Monthly Profit
                        <br />
                        Total profit / all month
                    </>}>
                        $ {metrics.averageMonthlyProfit.toFixed(2)}
                    </ButtonTooltip>
                </>
            }
        >
            {(expanded) => (
                <>
                    {expanded && (
                        <Card>
                            <CardContent>
                                <Table size="small">
                                    <TableBody>
                                        <TableRow>
                                            <TableCell>Profitable Months</TableCell>
                                            <TableCell>{metrics.profitableMonths}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Worst Month Profit</TableCell>
                                            <TableCell>
                                                $ {metrics.worstMonthProfit.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Max Monthly Drawdown</TableCell>
                                            <TableCell>
                                                $ {metrics.maxMonthlyDrawdown.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Std Dev Monthly Profit</TableCell>
                                            <TableCell>
                                                $ {metrics.stdDevMonthlyProfit.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Sharpe Ratio</TableCell>
                                            <TableCell>{metrics.sharpeRatio.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Avg Holding Duration</TableCell>
                                            <TableCell>
                                                {humanizeDuration(metrics.avgHoldingDurationMinutes)}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Trades per Month</TableCell>
                                            <TableCell>
                                                {metrics.tradeFrequencyPerMonth.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Passive-Friendly?</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={metrics.isPassiveFriendly ? "Yes ✅" : "No ❌"}
                                                    color={
                                                        metrics.isPassiveFriendly ? "success" : "error"
                                                    }
                                                />
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </HeaderMetrics>
    );
}
