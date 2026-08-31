"use client";

import { delayExecution } from "@/components/client/utils";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Typography,
} from "@mui/material";
import moment from "moment";
import { type ReactNode, useMemo, useState } from "react";

import { DESCISION_MODELS } from "@/lib/dynamic/constants-clients";
import { grey } from "@mui/material/colors";
import { type BacktestConfig } from "../Config";
import type { Leaderboards, SavedPayload } from "../type-dynamic-report";

const productionKeys = [
    "name",
    "description",
    "symbols",
    "modelConfig",
];

export interface LeaderboardsProps {
    handleClose: () => void
    deleteHistoryItem: (id: string) => Promise<void>;
    history: SavedPayload[];
    historyLoading: boolean;
    loadHistory: () => Promise<void>;
    onApplyConfig: (config: BacktestConfig) => void;
    onRunConfig: (config: BacktestConfig) => void | Promise<void>;
    primaryActionLabel?: ReactNode;
    secondaryActionLabel?: ReactNode;
    showRunAction?: boolean;
}

type Order = "asc" | "desc";

/** ms -> human string */
function msToHuman(ms?: number) {
    if (!ms || ms <= 0) return "0s";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ${min % 60}m`;
    const days = Math.floor(hr / 24);
    return `${days}d ${hr % 24}h`;
}

function formatPercent(value: number | undefined, isProbab: boolean = false) {
    if (value == null || Number.isNaN(value)) return "-";
    if (Math.abs(value) <= 1 || isProbab) return `${(value * 100).toFixed(1)}%`;
    return `${Number(value).toFixed(1)}%`;
}

function formatCompactPercent(value: number | undefined) {
    if (value == null || Number.isNaN(value)) return "-";
    return Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value) + "%";
}

function formatNumber(value: number | undefined) {
    if (value == null || Number.isNaN(value)) return "-";
    // return Number(value).toLocaleString();
    return value?.toFixed(2);
}

function formatBacktestRange(config: BacktestConfig) {
    if (config.range !== "custom") {
        return config.range;
    }

    const hasCustomWindow =
        typeof config.startTime === "number" &&
        config.startTime > 0 &&
        typeof config.endTime === "number" &&
        config.endTime > 0;

    if (!hasCustomWindow) {
        return "custom";
    }

    return `${moment(config.startTime).format("YYYY-MM-DD")} -> ${moment(
        config.endTime,
    ).format("YYYY-MM-DD")}`;
}

/** nested getter */
function getNested(obj: any, path: string) {
    if (!obj) return undefined;
    return path
        .split(".")
        .reduce((acc: any, key) => (acc ? acc[key] : undefined), obj);
}

/** descriptions for headers */
const HEADER_DESCRIPTIONS: Record<string, string> = {
    openFloatingDrawdown:
        `Maximal gap between currentAsset and floating asset. Lower drawdown is better.
        drawdown = (openBase - openBaseFloating) / openBase;
        `,
    maxPortfolioDrawdown: `Maximal gap between currentAsset and floating asset.
        drawdown = (currentAsset - currentAssetFloating) / currentAsset;
        Minimal are better`,
    "leaderboards.maxPortfolioDrawdown.avg": "Averaged across time (lower better).",
    "leaderboards.maxPortfolioDrawdown.max": "Maximum observed drawdown across time (higher means deeper worst dip).",
    emptyBalance:
        "When currentBalance == 0: durations (min/avg/max) the account stayed empty.",
    "leaderboards.openFloatingDrawdown.avg":
        "Averaged across time (lower better).",
    "leaderboards.openFloatingDrawdown.max":
        "Maximum observed drawdown across time (higher means deeper worst dip).",
    "leaderboards.bearMarketProofRatio":
        "Higher = better. How well the strategy preserved asset value during known bear periods (100% ideal).",
    "leaderboards.gainPercent":
        "Overall gain percentage from starting balance to final balance. (finalBalance - startingBalanceUSDT + safeHaven) / startingBalanceUSDT)",
    "leaderboards.avgMonthlyProfitRatio":
        "Average monthly profit normalized by starting balance.",

    monthlyGain: "Monthly gain percentage summary (min / avg / max).",
    "leaderboards.monthlyGain.min":
        "Lowest monthly gain observed across all months in the run.",
    "leaderboards.monthlyGain.avg":
        "Average monthly gain across the entire backtest period.",
    "leaderboards.monthlyGain.max":
        "Highest monthly gain observed across any month.",

    "leaderboards.emptyBalance.min":
        "Shortest time the account stayed at zero balance.",
    "leaderboards.emptyBalance.avg":
        "Average duration the account stayed at zero balance.",
    "leaderboards.emptyBalance.max":
        "Longest time the account stayed at zero balance.",
    "leaderboards.balanceTradesScore":
        "How evenly trades are distributed across coins (0..1). Higher is more even.",

    "leaderboards.capitalEfficiency.hrScore":
        "Held-ratio score (1 = low stuck capital, better). How much of your capital is “stuck” in base assets vs actively tradable.",
    "leaderboards.capitalEfficiency.trScore":
        "Turnover score (1 = faster capital rotation). How actively the capital moves per day",
    "leaderboards.capitalEfficiency.score":
        "Final combined efficiency score (weighted HR + TR).",

    "leaderboards.sharpeRatio":
        "Risk-adjusted return metric. Higher is better. < 1.0: Sub-optimal | 1.0-2.0: Good | 2.0-3.0: Very Good | > 3.0: Excellent",

    label: "Saved run label (name or symbols · range).",
    createdAt: "Timestamp when the backtest was saved.",
};

/** 🎨 color helper (now supports inversion + handles min===max) */
function getGradientColor(
    value: number | undefined,
    min = 0,
    max = 1,
    invert = false
): string {
    if (value == null || Number.isNaN(value)) return "inherit";
    // if no variation, return an indicative color (green when not inverted, red when inverted)
    if (max === min) {
        return invert ? "rgba(255, 50, 50, 0.18)" : "rgba(50, 255, 100, 0.18)";
    }
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const r = invert ? 1 - ratio : ratio;
    const red = Math.round(255 * (1 - r));
    const green = Math.round(255 * r);
    return `rgba(${red}, ${green}, 100, 0.18)`; // translucent gradient
}

export default function Leaderboards({
    handleClose,
    deleteHistoryItem,
    history,
    historyLoading,
    loadHistory,
    onApplyConfig,
    onRunConfig,
    primaryActionLabel = "Load",
    secondaryActionLabel = "Run",
    showRunAction = true,
}: LeaderboardsProps) {
    const [orderBy, setOrderBy] = useState<string>("leaderboards.gainPercent");
    const [order, setOrder] = useState<Order>("desc");

    const loadHistoryItem = (item: SavedPayload) => {
        onApplyConfig(item.backtestConfig);
    };

    const copyItemJson = async (item: SavedPayload, only?: string[]) => {
        const usedKeys = only ? only : Object.keys(item.backtestConfig);
        const temp: Record<string, any> = {};

        if (only) {
            if (item.leaderboards) {
                temp["leaderboards"] = item.leaderboards;
            }
        }

        for (const key of usedKeys) {
            temp[key] = item.backtestConfig[key as keyof BacktestConfig];
        }

        await navigator.clipboard.writeText(JSON.stringify(temp, null, 2));
        alert("Copied JSON to clipboard");
    };

    const copySomething = async (temp: any) => {
        await navigator.clipboard.writeText(JSON.stringify(temp, null, 2));
        alert("Copied JSON to clipboard");
    };

    const executeSaved = async (item: SavedPayload) => {
        onApplyConfig(item.backtestConfig);
        await delayExecution(() => onRunConfig(item.backtestConfig), 50);
    };

    const leaderboardRows = useMemo(
        () =>
            history.map((item) => ({
                id: item.id,
                label:
                    item.label ??
                    `${item.backtestConfig.symbols.join(", ")} · ${item.backtestConfig.range
                    }`,
                name: item.backtestConfig.name,
                descrption: item.backtestConfig.descrption,
                createdAt: item.createdAt,
                leaderboards: item.leaderboards as Leaderboards,
                original: item,
            })),
        [history]
    );

    // Compute ranges for emptyBalance columns so gradient is relative across rows
    const emptyRanges = useMemo(() => {
        const minVals: number[] = [];
        const avgVals: number[] = [];
        const maxVals: number[] = [];

        for (const r of leaderboardRows) {
            const e = r.leaderboards?.emptyBalance;
            if (!e) continue;
            if (e.min != null) minVals.push(e.min);
            if (e.avg != null) avgVals.push(e.avg);
            if (e.max != null) maxVals.push(e.max);
        }

        const calc = (arr: number[]) =>
            arr.length === 0
                ? { min: 0, max: 0 }
                : { min: Math.min(...arr), max: Math.max(...arr) };

        return {
            minRange: calc(minVals),
            avgRange: calc(avgVals),
            maxRange: calc(maxVals),
        };
    }, [leaderboardRows]);

    // Compute range for balanceTradesScore column (0..1 expected)
    const balanceRange = useMemo(() => {
        const vals: number[] = [];
        for (const r of leaderboardRows) {
            const v = r.leaderboards?.balanceTradesScore;
            if (v != null && !Number.isNaN(v)) vals.push(v);
        }
        if (vals.length === 0) return { min: 0, max: 1 };
        return { min: Math.min(...vals), max: Math.max(...vals) };
    }, [leaderboardRows]);

    const headerGroups: {
        id: string;
        label: string;
        children?: { id: string; label: string; align?: "left" | "right" }[];
        align?: "left" | "right" | "center";
        maxWidth?: string;
    }[] = [
            { id: "label", label: "Label", maxWidth: "200px" },
            {
                id: "maxPortfolioDrawdown",
                label: "Portfolio Drawdown",
                align: "center",
                children: [
                    { id: "leaderboards.maxPortfolioDrawdown.avg", label: "avg" },
                    { id: "leaderboards.maxPortfolioDrawdown.max", label: "max" },
                ],
            },
            {
                id: "openFloatingDrawdown",
                label: "Floating Drawdown",
                align: "center",
                children: [
                    { id: "leaderboards.openFloatingDrawdown.avg", label: "avg" },
                    { id: "leaderboards.openFloatingDrawdown.max", label: "max" },
                ],
            },
            { id: "leaderboards.bearMarketProofRatio", label: "Bear Proof Ratio" },
            { id: "leaderboards.gainPercent", label: "Gain (%)", align: "right" },
            { id: "leaderboards.avgMonthlyProfitRatio", label: "Avg Monthly Profit" },
            {
                id: "monthlyGain",
                label: "Monthly Gain (%)",
                align: "center",
                children: [
                    { id: "leaderboards.monthlyGain.min", label: "min" },
                    { id: "leaderboards.monthlyGain.avg", label: "avg" },
                    { id: "leaderboards.monthlyGain.max", label: "max" },
                ],
            },

            {
                id: "leaderboards.balanceTradesScore",
                label: "Trades Balance",
                align: "center",
            },
            {
                id: "leaderboards.sharpeRatio",
                label: "Sharpe Ratio",
                align: "center",
            },

            {
                id: "capitalEfficiency",
                label: "Capital Efficiency",
                align: "center",
                children: [
                    { id: "leaderboards.capitalEfficiency.hrScore", label: "HR Score" },
                    { id: "leaderboards.capitalEfficiency.trScore", label: "TR Score" },
                    { id: "leaderboards.capitalEfficiency.score", label: "Final" },
                ],
            },
            {
                id: "emptyBalance",
                label: "Empty Balance",
                align: "center",
                children: [
                    { id: "leaderboards.emptyBalance.min", label: "min" },
                    { id: "leaderboards.emptyBalance.avg", label: "avg" },
                    { id: "leaderboards.emptyBalance.max", label: "max" },
                ],
            },
        ];

    function comparator(aVal: any, bVal: any) {
        const aU = aVal === undefined || aVal === null;
        const bU = bVal === undefined || bVal === null;
        if (aU && bU) return 0;
        if (aU) return -1;
        if (bU) return 1;
        if (typeof aVal === "number" && typeof bVal === "number")
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum))
            return aNum < bNum ? -1 : aNum > bNum ? 1 : 0;
        return String(aVal).localeCompare(String(bVal));
    }

    const sortedRows = useMemo(() => {
        const rows = [...leaderboardRows];
        const path = orderBy;
        rows.sort((a, b) => {
            const aVal: any = getNested(a, path);
            const bVal: any = getNested(b, path);
            const cmp = comparator(aVal, bVal);
            return order === "asc" ? cmp : -cmp;
        });
        return rows;
    }, [leaderboardRows, orderBy, order]);

    const handleSort = (property: string) => {
        const isAsc = orderBy === property && order === "asc";
        setOrder(isAsc ? "desc" : "asc");
        setOrderBy(property);
    };

    // Compute ranges for monthlyGain columns so gradient is relative across rows
    const monthlyRanges = useMemo(() => {
        const minVals: number[] = [];
        const avgVals: number[] = [];
        const maxVals: number[] = [];

        for (const r of leaderboardRows) {
            const mg = r.leaderboards?.monthlyGain;
            if (!mg) continue;
            if (mg.min != null && !Number.isNaN(mg.min)) minVals.push(mg.min);
            if (mg.avg != null && !Number.isNaN(mg.avg)) avgVals.push(mg.avg);
            if (mg.max != null && !Number.isNaN(mg.max)) maxVals.push(mg.max);
        }

        const calc = (arr: number[]) =>
            arr.length === 0
                ? { min: 0, max: 0 }
                : { min: Math.min(...arr), max: Math.max(...arr) };

        return {
            minRange: calc(minVals),
            avgRange: calc(avgVals),
            maxRange: calc(maxVals),
        };
    }, [leaderboardRows]);

    if (historyLoading && history.length === 0) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress size={28} />
            </Box>
        );
    }

    return (
        <TableContainer>
            <Table
                size="small"
                sx={{
                    borderCollapse: "collapse", // ensure single border lines, no double overlap
                    "& td, & th": {
                        p: 0.5,
                        m: 0,
                        borderRight: "1px solid rgba(0,0,0,0.15)", // vertical line
                        borderBottom: "1px solid rgba(0,0,0,0.15)", // horizontal line
                        textAlign: "center",
                    },
                }}
            >
                <TableHead
                    sx={{
                        backgroundColor: grey[300],
                    }}
                >
                    <TableRow>
                        <TableCell colSpan={20}>
                            <Box
                                sx={{
                                    alignItems: "center",
                                    display: "flex",
                                    gap: 1,
                                    justifyContent: "space-between",
                                }}
                            >
                                <Box sx={{ color: grey[700], fontSize: 13 }}>
                                    Stored in `storage/persistent/instances/[PORT]/slow/leaderboards.json`
                                </Box>

                                <Button
                                    disabled={historyLoading}
                                    onClick={() => void loadHistory()}
                                    size="small"
                                >
                                    {historyLoading ? "Refreshing..." : "Refresh"}
                                </Button>
                            </Box>
                        </TableCell>
                    </TableRow>
                    {/* First header row: parents */}
                    <TableRow>
                        {headerGroups.map((group) => {
                            if (group.children && group.children.length > 0) {
                                return (
                                    <TableCell
                                        key={group.id}
                                        align={group.align ?? "left"}
                                        colSpan={group.children.length}
                                        width={group.maxWidth}
                                    >
                                        <Button
                                            title={HEADER_DESCRIPTIONS[group.id] ?? group.label}
                                            color="inherit"
                                        >
                                            {group.label}
                                        </Button>
                                    </TableCell>
                                );
                            }
                            return (
                                <TableCell
                                    key={group.id}
                                    align={group.align ?? "left"}
                                    rowSpan={2}
                                    width={group.maxWidth}
                                >
                                    <Button
                                        title={HEADER_DESCRIPTIONS[group.id] ?? group.label}
                                        color="inherit"
                                    >
                                        <TableSortLabel
                                            active={orderBy === group.id}
                                            direction={orderBy === group.id ? order : "asc"}
                                            onClick={() => handleSort(group.id)}
                                        >
                                            {group.label}
                                        </TableSortLabel>
                                    </Button>
                                </TableCell>
                            );
                        })}
                        <TableCell align="center" rowSpan={2}>
                            Actions
                        </TableCell>
                    </TableRow>

                    {/* Second header row: children */}
                    <TableRow>
                        {headerGroups.map((group) =>
                            group.children && group.children.length > 0
                                ? group.children.map((child) => (
                                    <TableCell key={child.id} align={child.align ?? "left"}>
                                        <Button
                                            title={HEADER_DESCRIPTIONS[child.id] ?? child.label}
                                            color="inherit"
                                        >
                                            <TableSortLabel
                                                active={orderBy === child.id}
                                                direction={orderBy === child.id ? order : "asc"}
                                                onClick={() => handleSort(child.id)}
                                            >
                                                {child.label}
                                            </TableSortLabel>
                                        </Button>
                                    </TableCell>
                                ))
                                : null
                        )}
                    </TableRow>
                </TableHead>

                <TableBody>
                    {sortedRows.map((row) => {
                        const lb = row.leaderboards;
                        return (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <Button
                                        color="info"
                                        title={`${row.descrption ?? ""} - ${row.label} - ${moment(
                                            row.createdAt
                                        ).format("YYYY-MM-DD HH:mm")}`}
                                    >
                                        {row.name}
                                    </Button>
                                    <Typography
                                        variant="caption"
                                        sx={{ display: "block", color: "text.secondary", px: 1 }}
                                    >
                                        {formatBacktestRange(row.original.backtestConfig)}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{ display: "block", color: "text.secondary", px: 1 }}
                                    >
                                        {DESCISION_MODELS.find(e => e.value == row.original.backtestConfig.decisionEngineVersion)?.name}
                                    </Typography>
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            1 - (lb?.maxPortfolioDrawdown?.avg ?? 0),
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.maxPortfolioDrawdown?.avg)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            1 - (lb?.maxPortfolioDrawdown?.max ?? 0),
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.maxPortfolioDrawdown?.max)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            1 - (lb?.openFloatingDrawdown?.avg ?? 0),
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.openFloatingDrawdown?.avg)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            1 - (lb?.openFloatingDrawdown?.max ?? 0),
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.openFloatingDrawdown?.max)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.bearMarketProofRatio ?? 0,
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.bearMarketProofRatio)}
                                </TableCell>

                                <TableCell
                                    align="right"
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            (lb?.gainPercent ?? 0) / 100,
                                            0,
                                            2
                                        ),
                                    }}
                                >
                                    {formatCompactPercent(lb?.gainPercent)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.avgMonthlyProfitRatio ?? 0,
                                            0,
                                            1
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.avgMonthlyProfitRatio, true)}
                                </TableCell>

                                {/* <-- INSERT THESE THREE CELLS: monthlyGain min / avg / max */}
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.monthlyGain?.min ?? 0,
                                            monthlyRanges.minRange.min,
                                            monthlyRanges.minRange.max,
                                            false
                                        ),
                                    }}
                                >
                                    {lb?.monthlyGain?.min != null
                                        ? formatNumber(lb.monthlyGain.min) + "%"
                                        : "-"}
                                </TableCell>
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.monthlyGain?.avg ?? 0,
                                            monthlyRanges.avgRange.min,
                                            monthlyRanges.avgRange.max,
                                            false
                                        ),
                                    }}
                                >
                                    {lb?.monthlyGain?.avg != null
                                        ? formatNumber(lb.monthlyGain.avg) + "%"
                                        : "-"}
                                </TableCell>
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.monthlyGain?.max ?? 0,
                                            monthlyRanges.maxRange.min,
                                            monthlyRanges.maxRange.max,
                                            false
                                        ),
                                    }}
                                >
                                    {lb?.monthlyGain?.max != null
                                        ? formatNumber(lb.monthlyGain.max) + "%"
                                        : "-"}
                                </TableCell>

                                {/* NEW: Trades balance score with gradient (higher = better) */}
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.balanceTradesScore ?? 0,
                                            balanceRange.min,
                                            balanceRange.max,
                                            false
                                        ),
                                        textAlign: "center",
                                    }}
                                >
                                    {formatPercent(lb?.balanceTradesScore)}
                                </TableCell>

                                {/* Sharpe Ratio (higher = better, typically 0-3+) */}
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.sharpeRatio ?? 0,
                                            -1,
                                            3,
                                            false
                                        ),
                                        textAlign: "center",
                                        fontWeight: (lb?.sharpeRatio ?? 0) >= 2 ? "bold" : "normal",
                                    }}
                                >
                                    {lb?.sharpeRatio != null
                                        ? formatNumber(lb.sharpeRatio)
                                        : "-"}
                                </TableCell>

                                {/* Capital Efficiency (hrScore, trScore, final score) */}
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.capitalEfficiency?.hrScore ?? 0,
                                            0,
                                            1,
                                            false
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.capitalEfficiency?.hrScore)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.capitalEfficiency?.trScore ?? 0,
                                            0,
                                            1,
                                            false
                                        ),
                                    }}
                                >
                                    {formatPercent(lb?.capitalEfficiency?.trScore)}
                                </TableCell>

                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.capitalEfficiency?.score ?? 0,
                                            0,
                                            1,
                                            false
                                        ),
                                        fontWeight: "bold",
                                    }}
                                >
                                    {formatPercent(lb?.capitalEfficiency?.score)}
                                </TableCell>

                                {/* Empty balance cells with gradient (longer = worse -> inverted gradient) */}
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.emptyBalance?.min,
                                            emptyRanges.minRange.min,
                                            emptyRanges.minRange.max,
                                            true
                                        ),
                                    }}
                                >
                                    {msToHuman(lb?.emptyBalance?.min)}
                                </TableCell>
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.emptyBalance?.avg,
                                            emptyRanges.avgRange.min,
                                            emptyRanges.avgRange.max,
                                            true
                                        ),
                                    }}
                                >
                                    {msToHuman(lb?.emptyBalance?.avg)}
                                </TableCell>
                                <TableCell
                                    sx={{
                                        backgroundColor: getGradientColor(
                                            lb?.emptyBalance?.max,
                                            emptyRanges.maxRange.min,
                                            emptyRanges.maxRange.max,
                                            true
                                        ),
                                    }}
                                >
                                    {msToHuman(lb?.emptyBalance?.max)}
                                </TableCell>

                                <TableCell>
                                    <Box sx={{ display: "flex" }}>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                loadHistoryItem(row.original);
                                                handleClose();
                                            }}
                                        >
                                            {primaryActionLabel}
                                        </Button>

                                        {showRunAction ? (
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    executeSaved(row.original);
                                                    handleClose();
                                                }}
                                            >
                                                {secondaryActionLabel}
                                            </Button>
                                        ) : null}
                                    </Box>

                                    <Divider sx={{ my: 1 }} />
                                    <IconButton
                                        size="small"
                                        onClick={() => copySomething(row.leaderboards)}
                                        title="Copy Leaderboard"
                                        color="warning"
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        onClick={() => copyItemJson(row.original, productionKeys)}
                                        title="Copy production config"
                                        color="info"
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        onClick={() => copyItemJson(row.original)}
                                        title="Copy backtest config"
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        disabled={historyLoading}
                                        onClick={() => void deleteHistoryItem(row.id)}
                                        title="Delete"
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
