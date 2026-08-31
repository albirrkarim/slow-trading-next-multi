"use client";

import type { Marker } from "@/components/LiveDashboard/converter";
import TradeChartBase from "@/components/LiveDashboard/Shared/TradeChartBase";
import ButtonDialog from "@/components/ui/ButtonDialog";
import type { GetIncomePerMonthReturn } from "@/lib/evaluate";
import type { TradeHistory } from "@/lib/dynamic/backtest-volatility/type";
import type { Position } from "@/lib/trading/models";
import {
    AccordionDetails,
    Box,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";
import { blue, orange, purple, teal } from "@mui/material/colors";
import type { UTCTimestamp } from "lightweight-charts";
import { type ReactNode, useMemo } from "react";
import BacktestTradeDebugSummary from "./BacktestTradeDebugSummary";
import HeaderMetrics from "./HeaderMetrics";

function getTradeProfit(label: string) {
    const match = label.match(/\$(-?\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
}

export function compactTradeLabel(label: string, trade?: TradeHistory) {
    const day = label.match(/^\((\d+)\)/)?.[1] ?? "";
    const profit = getTradeProfit(label);
    const amount = `${profit < 0 ? "-" : "+"}$${Math.abs(profit).toFixed(2)}`;
    const position = getTradePosition(trade);
    const entryLevel =
        typeof position?.opened.vPoint.lvl === "number" &&
            Number.isFinite(position.opened.vPoint.lvl)
            ? `EL:${position.opened.vPoint.lvl}`
            : "";
    const leverage =
        typeof position?.exposure.leverage === "number" &&
            Number.isFinite(position.exposure.leverage) &&
            position.exposure.leverage > 0
            ? `LEV:${position.exposure.leverage}`
            : "";
    const tradeMeta = [entryLevel, leverage].filter(Boolean);

    if (!label.includes("[EXIT]")) {
        return [day, amount, ...tradeMeta].filter(Boolean).join(" ");
    }

    const symbol = label.match(/\[EXIT\]\s+([A-Z]+)/)?.[1] ?? "";
    const direction = label.match(/\b(LONG|SHORT)\b/)?.[1] ?? "";
    const category = label.includes("[L_ISOLATED]")
        ? "LIQUIDATED"
        : label.includes("[TAKE_PROFIT]")
            ? "TAKE PROFIT"
            : "EXIT";

    return [day, amount, ...tradeMeta, symbol, direction, category]
        .filter(Boolean)
        .join(" ");
}

export function getTradePosition(trade?: TradeHistory) {
    return trade?.positionsBefore?.[0] ?? trade?.positionsAfter?.[0] ?? null;
}

export function getTradeSymbol(trade?: TradeHistory) {
    const position = getTradePosition(trade);
    if (position?.symbol) {
        return position.symbol;
    }

    return trade?.message?.match(/\[EXIT\]\s+([A-Z]+)/)?.[1] ?? "";
}

/** Reads the recorded exit level from a backtest exit message. */
function getBacktestExitLevel(trade: TradeHistory): number | null {
    const match = trade.message?.match(/\bExit\s+(-?\d+(?:\.\d+)?)/i);
    const level = match ? Number(match[1]) : Number.NaN;

    return Number.isFinite(level) ? level : null;
}

/**
 * Enriches a pre-close backtest snapshot with its recorded exit for UI review.
 * The returned copy is never written back to simulation history.
 */
function buildBacktestReviewPosition(
    position: Position,
    trade: TradeHistory,
): Position {
    const exitLevel = getBacktestExitLevel(trade);
    if (exitLevel === null || position.closed?.vPoint) {
        return position;
    }

    return {
        ...position,
        closed: {
            feeUsdt: position.closed?.feeUsdt ?? trade.fee ?? 0,
            message: position.closed?.message ?? trade.message ?? "[EXIT] Backtest trade",
            price: position.closed?.price ?? trade.price,
            reason: position.closed?.reason ?? "UNKNOWN",
            t: position.closed?.t ?? trade.time,
            vPoint: {
                id: `BACKTEST_EXIT_${trade.time}`,
                lvl: exitLevel,
            },
        },
    };
}

function getMarketType(trade?: TradeHistory): "SPOT" | "FUTURES" {
    const position = getTradePosition(trade);
    const mode = String(position?.tradingMode ?? "").toUpperCase();
    return mode.includes("FUTURE") ? "FUTURES" : "SPOT";
}

function getTradePnlPercent(trade: TradeHistory, profit: number) {
    const position = getTradePosition(trade);
    if (
        typeof position?.pnl.netPct === "number" &&
        Number.isFinite(position.pnl.netPct) &&
        position.pnl.netPct !== 0
    ) {
        return position.pnl.netPct;
    }

    const margin = position?.exposure.marginUsdt ?? position?.exposure.notionalUsdt ?? 0;
    if (margin > 0 && Number.isFinite(margin)) {
        return (profit / margin) * 100;
    }

    const messageMatch = trade.message?.match(/profit:\s*(-?\d+(?:\.\d+)?)%/);
    return messageMatch ? Number(messageMatch[1]) : 0;
}

function formatMarkerNumber(value?: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "";
    }

    return Number(value.toFixed(6)).toString();
}

function formatAveragingMultiplierLabel(trigger: {
    adaptiveMultiplier?: number;
    allocationPct?: number;
}) {
    const multiplier =
        typeof trigger.adaptiveMultiplier === "number" &&
            Number.isFinite(trigger.adaptiveMultiplier) &&
            trigger.adaptiveMultiplier > 0
            ? trigger.adaptiveMultiplier
            : trigger.allocationPct;

    return typeof multiplier === "number" &&
        Number.isFinite(multiplier) &&
        multiplier > 0
        ? ` ${formatMarkerNumber(multiplier)}x`
        : "";
}

function buildMarkersFromMonthlyTrades(
    trades: TradeHistory[],
    selectedSymbol: string,
    window?: {
        endTimeMs?: number;
        startTimeMs?: number;
    },
    selectedTrade?: TradeHistory,
): Marker[] {
    const markers: Marker[] = [];
    const isInsideWindow = (timeMs?: number) => {
        if (typeof timeMs !== "number" || !Number.isFinite(timeMs)) {
            return false;
        }

        if (
            typeof window?.startTimeMs === "number" &&
            Number.isFinite(window.startTimeMs) &&
            timeMs < window.startTimeMs
        ) {
            return false;
        }

        if (
            typeof window?.endTimeMs === "number" &&
            Number.isFinite(window.endTimeMs) &&
            timeMs > window.endTimeMs
        ) {
            return false;
        }

        return true;
    };

    for (const trade of trades) {
        if (getTradeSymbol(trade) !== selectedSymbol) {
            continue;
        }

        const position = getTradePosition(trade);
        if (!position) {
            continue;
        }

        const entryId = position.opened.vPoint.id ?? "";
        const isSelectedTrade = trade === selectedTrade;
        if (!isSelectedTrade && isInsideWindow(position.opened.t)) {
            markers.push({
                color: blue[400],
                position: "belowBar",
                shape: "arrowUp",
                text: `ENTRY ${entryId}`,
                time: Math.floor(position.opened.t / 1000) as UTCTimestamp,
            });
        }

        if (!isSelectedTrade) {
            const triggers = position.strategy.averaging.executions ?? [];
            for (const trigger of triggers) {
                if (!isInsideWindow(trigger.t)) {
                    continue;
                }

                markers.push({
                    color: teal[500],
                    position: "belowBar",
                    shape: "circle",
                    text: `AVG L${trigger.level}${formatAveragingMultiplierLabel(trigger)}`,
                    time: Math.floor(trigger.t / 1000) as UTCTimestamp,
                });
            }
        }

        if (isInsideWindow(trade.time)) {
            const isLoss = (trade.profit ?? 0) < 0;
            const entryPriceLabel = formatMarkerNumber(position.exposure.averageEntryPrice);
            markers.push({
                color: isLoss ? orange[700] : purple[500],
                position: "aboveBar",
                shape: "arrowDown",
                text: isLoss
                    ? `LOSS ${entryId} with entry price ${entryPriceLabel}`
                    : `EXIT ${entryId}`,
                time: Math.floor(trade.time / 1000) as UTCTimestamp,
            });
        }
    }

    return markers;
}

export function MonthlyTradeChartDialog({
    allTrades,
    chip,
    fullLabel,
    profit,
    trade,
}: {
    allTrades: TradeHistory[];
    chip: ReactNode;
    fullLabel: string;
    profit: number;
    trade?: TradeHistory;
}) {
    const position = getTradePosition(trade);
    const symbol = getTradeSymbol(trade);

    if (!trade || !position || !symbol) {
        return <>{chip}</>;
    }

    const entryTime = position.opened.t;
    const exitTime = trade.time;
    const paddingMs = 1000 * 60 * 60 * 24 * 30;
    const startTimeMs =
        typeof entryTime === "number" && Number.isFinite(entryTime)
            ? entryTime - paddingMs
            : undefined;
    const endTimeMs =
        typeof exitTime === "number" && Number.isFinite(exitTime)
            ? exitTime + paddingMs
            : undefined;
    const pnlPercent = getTradePnlPercent(trade, profit);
    const reviewPosition = buildBacktestReviewPosition(position, trade);

    return (
        <ButtonDialog
            title="Chart"
            titleLong={`${symbol} — ${profit < 0 ? "Loss" : "Trade"} Review`}
            maxWidth="xl"
            customButton={(handleOpen) => (
                <Tooltip arrow title={fullLabel}>
                    <span onClick={handleOpen}>{chip}</span>
                </Tooltip>
            )}
        >
            {() => (
                <Box sx={{ p: 1, backgroundColor: "background.default" }}>
                    <TradeChartBase
                        // BTEST:BACKTEST_TRADE_CHART_AVERAGING
                        activePosition={reviewPosition}
                        dashedEntryPriceLine
                        defaultInterval="5m"
                        defaultShowVolatility
                        endTimeMs={endTimeMs}
                        exchange="okx"
                        marketType={getMarketType(trade)}
                        markers={buildMarkersFromMonthlyTrades(
                            allTrades,
                            symbol,
                            {
                                endTimeMs,
                                startTimeMs,
                            },
                            trade,
                        )}
                        startTimeMs={startTimeMs}
                        symbol={symbol}
                        volatilitySource="generated"
                        header={
                            <>
                                <Typography variant="body2">
                                    <strong>Entry:</strong> {position.direction}{" "}
                                    {position.exposure.averageEntryPrice?.toFixed(6)} @{" "}
                                    {position.opened.t
                                        ? new Date(position.opened.t).toLocaleString()
                                        : "-"}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Entry ID:</strong>{" "}
                                    {position.opened.vPoint.id || "-"}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Exit:</strong> {trade.price?.toFixed(6)} @{" "}
                                    {trade.time ? new Date(trade.time).toLocaleString() : "-"}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: profit < 0 ? "error.main" : "success.main",
                                        fontWeight: 800,
                                    }}
                                    variant="body2"
                                >
                                    PnL: {pnlPercent >= 0 ? "+" : ""}
                                    {pnlPercent.toFixed(2)}% ($
                                    {profit.toFixed(2)})
                                </Typography>
                                <Typography color="text.secondary" variant="body2">
                                    <strong>Window:</strong>{" "}
                                    {startTimeMs
                                        ? new Date(startTimeMs).toLocaleString()
                                        : "-"}{" "}
                                    {" -> "}
                                    {endTimeMs ? new Date(endTimeMs).toLocaleString() : "-"}
                                </Typography>
                                <Typography color="text.secondary" variant="body2">
                                    {trade.message}
                                </Typography>
                                <BacktestTradeDebugSummary
                                    position={reviewPosition}
                                />
                            </>
                        }
                    />
                </Box>
            )}
        </ButtonDialog>
    );
}

export default function MonthlyProfitReport({
    stability,
}: {
    stability: GetIncomePerMonthReturn;
}) {
    const { avgMonthlyProfit, months, monthlyProfitMap } = stability;
    const allTrades = useMemo(
        () =>
            months.flatMap((month) =>
                monthlyProfitMap[month].tradesInfos
                    .map((info) => info.trade)
                    .filter((trade): trade is TradeHistory => Boolean(trade)),
            ),
        [monthlyProfitMap, months],
    );

    return (
        <HeaderMetrics
            title={
                <Button color="inherit" size="small">
                    Average Monthly Profit on trade month{" "}
                    {avgMonthlyProfit.toFixed(2)} USDT
                </Button>
            }
        >
            {(expanded) => (
                <>
                    {expanded && (
                        <AccordionDetails>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Month</TableCell>
                                        <TableCell align="right">Profit (USDT)</TableCell>
                                        <TableCell align="right">Balance</TableCell>
                                        <TableCell>Trades</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {months.map((month) => {
                                        const { total, currentBalance, tradesInfos } =
                                            monthlyProfitMap[month];
                                        const profitTone =
                                            total < 0 ? "error.main" : "success.main";
                                        return (
                                            <TableRow key={month}>
                                                <TableCell>
                                                    <Typography fontWeight="bold">{month}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography color={profitTone} fontWeight={800}>
                                                        {total.toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    {currentBalance.toFixed(2)}
                                                </TableCell>
                                                <TableCell>
                                                    <Box
                                                        sx={{
                                                            display: "flex",
                                                            flexWrap: "wrap",
                                                            gap: 0.5,
                                                        }}
                                                    >
                                                        {tradesInfos.map((tradeInfo, i) => {
                                                            const t = monthlyProfitMap[month].trades[i] ?? "";
                                                            const profit = tradeInfo.profit;
                                                            const color =
                                                                profit < 0
                                                                    ? "error"
                                                                    : profit > 0
                                                                        ? "success"
                                                                        : "default";
                                                            const chip = (
                                                                <Chip
                                                                    clickable={Boolean(tradeInfo.trade)}
                                                                    color={color}
                                                                    label={compactTradeLabel(t, tradeInfo.trade)}
                                                                    size="small"
                                                                    sx={{
                                                                        cursor: tradeInfo.trade ? "pointer" : "default",
                                                                        fontWeight: profit < 0 ? 800 : 500,
                                                                        maxWidth: 260,
                                                                    }}
                                                                    variant="outlined"
                                                                />
                                                            );

                                                            return (
                                                                <MonthlyTradeChartDialog
                                                                    allTrades={allTrades}
                                                                    chip={chip}
                                                                    fullLabel={t}
                                                                    key={i}
                                                                    profit={profit}
                                                                    trade={tradeInfo.trade}
                                                                />
                                                            );
                                                        })}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </AccordionDetails>
                    )}
                </>
            )}
        </HeaderMetrics>
    );
}
