"use client";

import type { TradingPerformance } from "@/lib/evaluate";
import {
    Box,
    Card,
    CardContent,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Typography,
} from "@mui/material";
import HeaderMetrics from "./HeaderMetrics";

import SpeedIcon from "@mui/icons-material/Speed";
import IconButtonTooltip from "../../ui/IconButtonTooltip";

interface Props {
    perf: TradingPerformance;
}

function MetricCard({
    label,
    tone = "default",
    value,
}: {
    label: string;
    tone?: "default" | "good" | "bad" | "info";
    value: string;
}) {
    const toneSx = {
        bad: {
            bgcolor: "rgba(211, 47, 47, 0.08)",
            borderColor: "rgba(211, 47, 47, 0.35)",
            color: "error.dark",
        },
        default: {
            bgcolor: "rgba(25, 118, 210, 0.04)",
            borderColor: "divider",
            color: "text.primary",
        },
        good: {
            bgcolor: "rgba(46, 125, 50, 0.08)",
            borderColor: "rgba(46, 125, 50, 0.35)",
            color: "success.dark",
        },
        info: {
            bgcolor: "rgba(25, 118, 210, 0.08)",
            borderColor: "rgba(25, 118, 210, 0.35)",
            color: "primary.dark",
        },
    }[tone];

    return (
        <Box
            sx={{
                border: 1,
                borderRadius: 2,
                minWidth: 112,
                px: 1.25,
                py: 0.7,
                ...toneSx,
            }}
        >
            <Typography
                sx={{ color: "text.secondary", lineHeight: 1, mb: 0.35 }}
                variant="caption"
            >
                {label}
            </Typography>
            <Typography fontWeight={800} lineHeight={1.15} variant="body2">
                {value}
            </Typography>
        </Box>
    );
}

export default function TradingPerformanceReport({ perf }: Props) {
    const hasBalance =
        Number.isFinite(perf.startingBalance) &&
        Number.isFinite(perf.finalBalance) &&
        (perf.startingBalance !== 0 || perf.finalBalance !== 0);
    const hasGain = hasBalance && Number.isFinite(perf.gain);
    const netPnlTone = perf.totalProfit < 0 ? "bad" : "good";
    const gainTone = !hasGain || perf.gain < 0 ? "bad" : "good";

    return (
        <HeaderMetrics
            title={
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 1,
                        py: 0.5,
                    }}
                >
                    <IconButtonTooltip tooltipTitle="Performance" size="small">
                        <SpeedIcon />
                    </IconButtonTooltip>

                    <MetricCard
                        label="Events"
                        value={`${perf.totalTrades}`}
                    />
                    <MetricCard
                        label="Closed Trades"
                        tone="info"
                        value={`${perf.closedTrades}`}
                    />
                    <Chip
                        color="success"
                        label={`Wins ${perf.winTrades}`}
                        size="small"
                        variant="outlined"
                    />
                    <Chip
                        color={perf.lossTrades > 0 ? "error" : "default"}
                        label={`Losses ${perf.lossTrades}`}
                        size="small"
                        variant="outlined"
                    />
                    <Chip
                        label={`Break-even ${perf.breakEvenTrades}`}
                        size="small"
                        variant="outlined"
                    />
                    <MetricCard
                        label="Win Rate"
                        tone={perf.winRate >= 70 ? "good" : "bad"}
                        value={`${perf.winRate.toFixed(2)}%`}
                    />
                    <MetricCard
                        label="Net PnL"
                        tone={netPnlTone}
                        value={`$${perf.totalProfit.toFixed(2)}`}
                    />
                    <MetricCard
                        label="Gain"
                        tone={gainTone}
                        value={hasGain ? `${perf.gain.toFixed(2)}%` : "Unavailable"}
                    />
                    <MetricCard
                        label="Balance"
                        value={
                            hasBalance
                                ? `$${perf.startingBalance.toFixed(2)} -> $${perf.finalBalance.toFixed(2)}`
                                : "Unavailable"
                        }
                    />
                </Box>
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
                                            <TableCell>Total Events</TableCell>
                                            <TableCell>{perf.totalTrades}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Closed Trades</TableCell>
                                            <TableCell>{perf.closedTrades}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Wins / Losses / Break-even</TableCell>
                                            <TableCell>
                                                {perf.winTrades} / {perf.lossTrades} /{" "}
                                                {perf.breakEvenTrades}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Win Rate</TableCell>
                                            <TableCell>{perf.winRate.toFixed(2)}%</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell>Profit Factor</TableCell>
                                            <TableCell>{perf.profitFactor}</TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell>Avg Profit (per win)</TableCell>
                                            <TableCell>$ {perf.avgProfit.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Avg Loss (per loss)</TableCell>
                                            <TableCell>$ {perf.avgLoss.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Total Net Profit</TableCell>
                                            <TableCell>$ {perf.totalProfit.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Total Gross Profit</TableCell>
                                            <TableCell>$ {perf.grossProfit.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Total Fee Paid</TableCell>
                                            <TableCell>$ {perf.totalFee.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Total Tax Paid</TableCell>
                                            <TableCell>$ {perf.totalTax.toFixed(2)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell>Maximum Drawdown</TableCell>
                                            <TableCell>$ {perf.maxDrawdown.toFixed(2)}</TableCell>
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
