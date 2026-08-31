"use client";

import type { DynamicTradeBacktestReturn } from "@/components/api/dynamic";
import {
    compactTradeLabel,
    MonthlyTradeChartDialog,
} from "@/components/dev/Evaluation/MonthlyProfitReport";
import type { GetIncomePerMonthReturn } from "@/lib/evaluate";
import type { TradeHistory } from "@/lib/dynamic/backtest-volatility/type";
import {
    Box,
    Chip,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

type ClosedTrade = DynamicTradeBacktestReturn["tradeHistory"][number];

function tradeKey(symbol: string, entryTime: number, exitTime?: number) {
    return `${symbol}|${entryTime}|${exitTime ?? ""}`;
}

function getDetailedTrades(stability?: GetIncomePerMonthReturn) {
    if (!stability) {
        return [];
    }

    return stability.months.flatMap((month) =>
        stability.monthlyProfitMap[month].tradesInfos
            .map((info) => info.trade)
            .filter((trade): trade is TradeHistory => Boolean(trade)),
    );
}

/** Indexes detailed exit events by their closed-position identity. */
function buildDetailedTradeMap(trades: TradeHistory[]) {
    const details = new Map<string, TradeHistory>();

    for (const trade of trades) {
        for (const position of trade.positionsBefore ?? []) {
            if (position.symbol) {
                details.set(
                    tradeKey(position.symbol, position.opened.t, trade.time),
                    trade,
                );
            }
        }
    }

    return details;
}

function normalizeReason(reason?: string) {
    return reason ?? "UNKNOWN";
}

function displayReason(reason: string) {
    return reason.replaceAll("_", " ");
}

function getDefaultReason(trades: ClosedTrade[]) {
    const lossCounts = new Map<string, number>();

    for (const trade of trades) {
        if (trade.netProfitUSDT >= 0) {
            continue;
        }

        const reason = normalizeReason(trade.exitReason);
        lossCounts.set(reason, (lossCounts.get(reason) ?? 0) + 1);
    }

    return (
        [...lossCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
        normalizeReason(trades[0]?.exitReason)
    );
}

function makeFullLabel(trade: ClosedTrade, detailedTrade: TradeHistory) {
    const day = new Date(trade.exitTime ?? trade.entryTime)
        .getDate()
        .toString()
        .padStart(2, "0");

    return `(${day}) $${trade.netProfitUSDT.toFixed(2)} ${detailedTrade.message ?? ""}`;
}

export default function ExitReasonTradeChips({
    stability,
    tradeHistory,
}: {
    stability?: GetIncomePerMonthReturn;
    tradeHistory: DynamicTradeBacktestReturn["tradeHistory"];
}) {
    const detailedTrades = useMemo(() => getDetailedTrades(stability), [stability]);
    const detailedTradeMap = useMemo(
        () => buildDetailedTradeMap(detailedTrades),
        [detailedTrades],
    );
    const reasonCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const trade of tradeHistory) {
            const reason = normalizeReason(trade.exitReason);
            counts.set(reason, (counts.get(reason) ?? 0) + 1);
        }
        return [...counts.entries()].sort((left, right) => right[1] - left[1]);
    }, [tradeHistory]);
    const defaultReason = useMemo(() => getDefaultReason(tradeHistory), [tradeHistory]);
    const [selectedReason, setSelectedReason] = useState(defaultReason);
    const activeReason = reasonCounts.some(([reason]) => reason === selectedReason)
        ? selectedReason
        : defaultReason;

    const selectedTrades = useMemo(
        () =>
            tradeHistory
                .filter((trade) => normalizeReason(trade.exitReason) === activeReason)
                .map((trade) => ({
                    detailedTrade: detailedTradeMap.get(
                        tradeKey(trade.symbol, trade.entryTime, trade.exitTime),
                    ),
                    trade,
                }))
                .filter(
                    (
                        item,
                    ): item is { detailedTrade: TradeHistory; trade: ClosedTrade } =>
                        Boolean(item.detailedTrade),
                )
                .sort((left, right) =>
                    left.trade.netProfitUSDT - right.trade.netProfitUSDT,
                ),
        [activeReason, detailedTradeMap, tradeHistory],
    );

    if (reasonCounts.length === 0 || detailedTrades.length === 0) {
        return null;
    }

    return (
        <Box sx={{ borderTop: 1, borderColor: "divider", px: 1.5, py: 1.25 }}>
            <FormControl size="small" sx={{ mb: 1, minWidth: 240 }}>
                <InputLabel id="exit-reason-debug-label">Closed reason</InputLabel>
                <Select
                    label="Closed reason"
                    labelId="exit-reason-debug-label"
                    onChange={(event) => setSelectedReason(event.target.value)}
                    value={activeReason}
                >
                    {reasonCounts.map(([reason, count]) => (
                        <MenuItem key={reason} value={reason}>
                            {displayReason(reason)} ({count})
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {selectedTrades.map(({ detailedTrade, trade }) => {
                    const fullLabel = makeFullLabel(trade, detailedTrade);
                    const chip = (
                        <Chip
                            clickable
                            color={trade.netProfitUSDT < 0 ? "error" : "success"}
                            label={compactTradeLabel(fullLabel, detailedTrade)}
                            size="small"
                            sx={{
                                fontWeight: trade.netProfitUSDT < 0 ? 800 : 500,
                                maxWidth: 260,
                            }}
                            variant="outlined"
                        />
                    );

                    return (
                        <MonthlyTradeChartDialog
                            allTrades={detailedTrades}
                            chip={chip}
                            fullLabel={fullLabel}
                            key={tradeKey(trade.symbol, trade.entryTime, trade.exitTime)}
                            profit={trade.netProfitUSDT}
                            trade={detailedTrade}
                        />
                    );
                })}
            </Box>

            {selectedTrades.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                    No chart details are available for this close reason.
                </Typography>
            )}
        </Box>
    );
}
