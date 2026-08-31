"use client";

import CoinMultiSelect from "@/components/ui/CoinMultiSelect";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DESCISION_MODELS } from "@/lib/dynamic/constants";
import { TradingMode } from "@/lib/exchange/types";
import type { TradingModelConfig } from "@/lib/trading/models";
import type { AdaptiveAveragingConfig } from "@/lib/dynamic";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import PostAverageRescueExitSettings from "@/components/LiveDashboard/Navbar/PostAverageRescueExitSettings";
import PostAverageStopLossSettings from "@/components/LiveDashboard/Navbar/PostAverageStopLossSettings";
import {
    Box,
    Checkbox,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { brown } from "@mui/material/colors";
import type { Dispatch, SetStateAction } from "react";
import HeaderMetrics from "../Evaluation/HeaderMetrics";
import { TIME_RANGE } from "@/components/constants";

export type BacktestConfig = {
    mode: "kline" | "volatility_point";

    // Data
    symbols: string[]; // multiple symbols selected
    range: string;
    // Optional override: when provided, these will be sent to server
    // and used instead of deriving from `range`.
    startTime?: number;
    endTime?: number;

    // Up to date
    upToDateKlines: boolean; // boolean: fetch fresh klines for selected symbols?
    upToDateDecisionBacktest: boolean;

    // Info
    name?: string;
    description?: string;

    // Starting point
    startingBalanceUSDT: number;

    // Config
    modelConfig: TradingModelConfig;

    // Dynamic Algorithm
    algorithm: string;

    // used in v4 and soo on
    decisionEngineVersion: string;

    tradingMode: TradingMode;

    marginMode?: "ISOLATED" | "CROSS";

    enableWatchLogic?: boolean;
    watchReserveLevels?: number;
    watchMaxNextAveragingLevels?: number;
    watchReservePctAlloc?: number;
    adaptiveAveraging?: AdaptiveAveragingConfig;
    averagingRescueProjectionGuardEnabled?: boolean;
    exitSidewaysToFreeWorkersForStrongCandidates?: boolean;
    maxEntryBased24HourVolPct?: number;
    maxEntryMarginPct?: number;
    maxEntryMargin?: number;
    maxOpenPositions?: number;
    minActionableAbsoluteLevel?: number;
    maxLeverage?: number;
    exactLeverage?: number;
};

// helper to create a default model config
function makeDefaultModelConfig(
    overrides?: Partial<TradingModelConfig>
): TradingModelConfig {
    const base: TradingModelConfig = {
        takeProfitPercent: 5,
        stopLossPercent: 90,
        volatilityTargetStopLossPercent: 0,
        postAverageRescueExit: postAverageRescue.config.createDefault(),
        postAverageStopLoss: postAverageStopLoss.config.createDefault(),
        useStopLossPlus: false,

        // safe haven
        safePercentPerMonth: 0.1,
        safeUSDTPerMonth: 0,
        minimalAssetOnTrade: 600,
    };
    return { ...base, ...(overrides ?? {}) };
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
    mode: "volatility_point",

    // Data
    symbols: [],
    range: "1year",
    startTime: undefined,
    endTime: undefined,
    upToDateKlines: false,
    upToDateDecisionBacktest: false,

    // Info
    name: "Example Name",
    description: "",

    // Starting point
    startingBalanceUSDT: 400,

    // Config
    modelConfig: makeDefaultModelConfig(),

    // algorithm
    algorithm: "dynamic.v4",

    decisionEngineVersion: "decision.v5",

    tradingMode: TradingMode.SPOT,

    marginMode: "ISOLATED",

    enableWatchLogic: true,
    watchReserveLevels: 2,
    watchMaxNextAveragingLevels: 2,
    watchReservePctAlloc: 2,
    adaptiveAveraging: adaptiveAveraging.config.createDefault(false),
    averagingRescueProjectionGuardEnabled: true,
    maxEntryBased24HourVolPct: 0.2,
    maxEntryMarginPct: 0,
    maxEntryMargin: 0,
    maxOpenPositions: 0,
    minActionableAbsoluteLevel: 2,
    maxLeverage: 0,
    exactLeverage: 0,
};

interface BacktestConfigProps {
    backtestConfig: BacktestConfig;
    setBacktestConfig: Dispatch<SetStateAction<BacktestConfig>>;
}

function HelpLabel({
    label,
    tooltip,
}: {
    label: string;
    tooltip: string;
}) {
    return (
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4 }}>
            <span>{label}</span>
            <Tooltip title={tooltip} arrow enterTouchDelay={0}>
                <HelpOutlineIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            </Tooltip>
        </Box>
    );
}

function HelpTextField({
    label,
    tooltip,
    sx,
    ...props
}: Parameters<typeof TextField>[0] & {
    label: string;
    tooltip: string;
}) {
    return (
        <Box sx={sx}>
            <HelpLabel label={label} tooltip={tooltip} />
            <TextField
                {...props}
                hiddenLabel
                sx={{
                    mt: 0.25,
                    width: "100%",
                    "& .MuiInputBase-root": { height: 40 },
                }}
            />
        </Box>
    );
}

export default function DynamicBacktestConfig({
    backtestConfig,
    setBacktestConfig,
}: BacktestConfigProps) {
    // top-level view setters
    const handleChange = (key: keyof BacktestConfig, value: any) => {
        setBacktestConfig((prev) => ({ ...prev, [key]: value }));
    };

    const handleSymbolsChange = (value: string[]) => {
        handleChange("symbols", value);
    };

    // backtest patch helpers
    const updateBacktest = (patch: Partial<BacktestConfig>) => {
        setBacktestConfig((prev) => ({ ...prev, ...patch }));
    };

    const updateModelConfig = (patch: Partial<TradingModelConfig>) => {
        setBacktestConfig((prev) => (
            {
                ...prev,
                modelConfig: {
                    ...prev.modelConfig,
                    ...patch,
                },
            }
        ));
    };

    // datetime helpers for HTML datetime-local input
    const msToLocalInput = (ms?: number): string => {
        if (!ms || ms <= 0) return "";
        const d = new Date(ms);
        // pad helper
        const pad = (n: number) => String(n).padStart(2, "0");
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const mi = pad(d.getMinutes());
        // datetime-local expects local time without seconds
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    };

    const localInputToMs = (value: string): number | undefined => {
        if (!value) return undefined;
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : undefined;
    };

    const compactControlSx = {
        "& .MuiInputLabel-root": {
            maxWidth: "calc(100% - 22px)",
        },
    };
    const adaptiveConfig = adaptiveAveraging.config.normalize(
        backtestConfig.adaptiveAveraging,
        false,
    );

    return (
        <Box sx={{ backgroundColor: brown[100], borderRadius: "6px", p: 1, pt: 2 }}>
            <HeaderMetrics
                title={
                    <Grid container spacing={1.25} alignItems="flex-start">
                        <Grid size={{ xs: 12, md: 5, lg: 3 }}>
                            <HeaderMetrics
                                title={
                                    <TextField
                                        label="Config name (optional)"
                                        fullWidth
                                        size="small"
                                        value={backtestConfig.name ?? ""}
                                        onChange={(e) => updateBacktest({ name: e.target.value })}
                                        placeholder="e.g. 'SLOW Aggressive 2025'"
                                    />
                                }
                            >
                                {(expand) => (
                                    <>
                                        {expand && (
                                            <TextField
                                                label="Description (optional)"
                                                fullWidth
                                                size="small"
                                                value={backtestConfig.description ?? ""}
                                                onChange={(e) =>
                                                    updateBacktest({ description: e.target.value })
                                                }
                                                placeholder="Short notes about this config"
                                            />
                                        )}
                                    </>
                                )}
                            </HeaderMetrics>
                        </Grid>

                        <Grid size={{ xs: 12, md: 4, lg: 2 }}>
                            {/* <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                                <InputLabel>Dynamic Algorithm</InputLabel>
                                <Select
                                    value={backtestConfig.algorithm}
                                    label="Dynamic"
                                    onChange={(e) => handleChange("algorithm", e.target.value)}
                                    size="small"
                                >
                                    {DYNAMIC_MODELS.map((item) => (
                                        <MenuItem
                                            key={item.name}
                                            value={item.name}
                                            title={item.descrption}
                                        >
                                            {item.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl> */}

                            <FormControl fullWidth size="small">
                                <InputLabel>Decision Engine</InputLabel>
                                <Select
                                    value={backtestConfig.decisionEngineVersion}
                                    label="Dynamic"
                                    onChange={(e) =>
                                        handleChange("decisionEngineVersion", e.target.value)
                                    }
                                    size="small"
                                >
                                    {DESCISION_MODELS.map((item) => (
                                        <MenuItem
                                            key={item.name}
                                            value={item.value}
                                            title={item.descrption}
                                        >
                                            {item.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid size={{ xs: 12, lg: 7 }}>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 1,
                                    alignItems: "center",
                                    minWidth: 0,
                                }}
                            >
                                <FormControl
                                    size="small"
                                    sx={{ ...compactControlSx, width: 104 }}
                                >
                                    <InputLabel>Mode</InputLabel>
                                    <Select
                                        value={backtestConfig.tradingMode || TradingMode.SPOT}
                                        label="Mode"
                                        onChange={(e) =>
                                            handleChange("tradingMode", e.target.value)
                                        }
                                        size="small"
                                    >
                                        <MenuItem value={TradingMode.SPOT}>SPOT</MenuItem>
                                        <MenuItem value={TradingMode.FUTURES}>FUTURES</MenuItem>
                                    </Select>
                                </FormControl>

                                {backtestConfig.tradingMode === TradingMode.FUTURES && (
                                    <FormControl
                                        size="small"
                                        sx={{ ...compactControlSx, width: 118 }}
                                    >
                                        <InputLabel>Margin</InputLabel>
                                        <Select
                                            value={backtestConfig.marginMode ?? "ISOLATED"}
                                            label="Margin"
                                            onChange={(e) =>
                                                updateBacktest({
                                                    marginMode: e.target.value as any,
                                                })
                                            }
                                            size="small"
                                        >
                                            <MenuItem value="ISOLATED">ISOLATED</MenuItem>
                                            <MenuItem value="CROSS">CROSS</MenuItem>
                                        </Select>
                                    </FormControl>
                                )}
                                <TextField
                                    label="Balance"
                                    type="number"
                                    size="small"
                                    value={backtestConfig.startingBalanceUSDT}
                                    onChange={(e) =>
                                        updateBacktest({
                                            startingBalanceUSDT: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 116 }}
                                />

                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={backtestConfig.enableWatchLogic !== false}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    enableWatchLogic: e.target.checked,
                                                })
                                            }
                                            size="small"
                                        />
                                    }
                                    label={
                                        <HelpLabel
                                            label="Watch"
                                            tooltip="Applies to backtest and live config. When enabled, new entries reserve balance for future averaging and the backtest may add to an existing position when deeper volatility levels appear."
                                        />
                                    }
                                    sx={{
                                        height: 40,
                                        m: 0,
                                        px: 0.5,
                                        whiteSpace: "nowrap",
                                    }}
                                />

                                <HelpTextField
                                    label="Reserve Next Levels"
                                    tooltip="Applied to backtest. Number of future averaging levels to reserve balance for when a new entry opens. Example: 3 reserves capital for the next 3 deeper volatility levels."
                                    type="number"
                                    size="small"
                                    value={backtestConfig.watchReserveLevels ?? 2}
                                    onChange={(e) =>
                                        updateBacktest({
                                            watchReserveLevels: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 150 }}
                                />

                                <HelpTextField
                                    label="Max Next Averaging Levels"
                                    tooltip="Applied to backtest. Relative cap for automatic averaging. Example: entry at level 4 and max 2 means averaging may add on 5 and 6, but not 7."
                                    type="number"
                                    size="small"
                                    value={backtestConfig.watchMaxNextAveragingLevels ?? 2}
                                    onChange={(e) =>
                                        updateBacktest({
                                            watchMaxNextAveragingLevels:
                                                Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 178 }}
                                />

                                <HelpTextField
                                    label="Reserve Multiplier"
                                    tooltip="Applied to backtest. Multiplies each reserved averaging step size. Example: entry margin 10 and multiplier 2 reserves 20 for the first add, then 60 for the next after position size grows."
                                    type="number"
                                    size="small"
                                    value={backtestConfig.watchReservePctAlloc ?? 2}
                                    onChange={(e) =>
                                        updateBacktest({
                                            watchReservePctAlloc: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 152 }}
                                />

                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={
                                                backtestConfig
                                                    .averagingRescueProjectionGuardEnabled ??
                                                true
                                            }
                                            onChange={(e) =>
                                                updateBacktest({
                                                    averagingRescueProjectionGuardEnabled:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                    }
                                    label={
                                        <HelpLabel
                                            label="Rescue Guard"
                                            tooltip="Applied to backtest. When enabled, averaging must improve the weighted entry and satisfy the projected rescue-profit target. Disable it to allow the normal watch-step margin when that projection fails."
                                        />
                                    }
                                    sx={{
                                        height: 40,
                                        m: 0,
                                        px: 0.5,
                                        whiteSpace: "nowrap",
                                    }}
                                />

                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={adaptiveConfig.enabled}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    adaptiveAveraging: {
                                                        ...adaptiveConfig,
                                                        enabled: e.target.checked,
                                                    },
                                                })
                                            }
                                        />
                                    }
                                    label={
                                        <HelpLabel
                                            label="Adaptive Avg"
                                            tooltip="Applied to backtest. When enabled, averaging can increase the multiplier when enough spendable balance exists and the configured projected-profit target can be reached."
                                        />
                                    }
                                    sx={{
                                        height: 40,
                                        m: 0,
                                        px: 0.5,
                                        whiteSpace: "nowrap",
                                    }}
                                />

                                <HelpTextField
                                    label="Adaptive Max Multiplier"
                                    tooltip="Highest multiplier the adaptive search may try. The normal reserve multiplier is always evaluated first."
                                    type="number"
                                    size="small"
                                    value={adaptiveConfig.maxMultiplier}
                                    onChange={(e) =>
                                        updateBacktest({
                                            adaptiveAveraging: {
                                                ...adaptiveConfig,
                                                maxMultiplier: Math.max(
                                                    1,
                                                    Math.floor(Number(e.target.value) || 0),
                                                ),
                                            },
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 178 }}
                                />

                                <HelpTextField
                                    label="Adaptive Min Profit %"
                                    tooltip="Minimum projected position profit required at the rescue target anchored to the triggering vPoint."
                                    type="number"
                                    size="small"
                                    value={adaptiveConfig.minProjectedProfitPct}
                                    onChange={(e) =>
                                        updateBacktest({
                                            adaptiveAveraging: {
                                                ...adaptiveConfig,
                                                minProjectedProfitPct: Math.max(
                                                    0,
                                                    Number(e.target.value) || 0,
                                                ),
                                            },
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 164 }}
                                />

                                <TextField
                                    label="24h Vol %"
                                    type="number"
                                    size="small"
                                    value={backtestConfig.maxEntryBased24HourVolPct ?? 0.2}
                                    onChange={(e) =>
                                        updateBacktest({
                                            maxEntryBased24HourVolPct: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 118 }}
                                />

                                <TextField
                                    label="Max Entry %"
                                    type="number"
                                    size="small"
                                    value={backtestConfig.maxEntryMarginPct ?? 0}
                                    onChange={(e) =>
                                        updateBacktest({
                                            maxEntryMarginPct: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 120 }}
                                />

                                <TextField
                                    label="Max Entry"
                                    type="number"
                                    size="small"
                                    value={backtestConfig.maxEntryMargin ?? 0}
                                    onChange={(e) =>
                                        updateBacktest({
                                            maxEntryMargin: Number(e.target.value) || 0,
                                        })
                                    }
                                    sx={{ ...compactControlSx, width: 110 }}
                                />

                                <HelpTextField
                                    label="Max Open Positions"
                                    tooltip="Maximum number of simultaneously open positions in the simulated portfolio. Set 0 to disable."
                                    type="number"
                                    size="small"
                                    value={backtestConfig.maxOpenPositions ?? 0}
                                    onChange={(e) =>
                                        updateBacktest({
                                            maxOpenPositions: Math.max(
                                                0,
                                                Math.floor(Number(e.target.value) || 0),
                                            ),
                                        })
                                    }
                                    slotProps={{
                                        htmlInput: {
                                            step: "1",
                                            inputMode: "numeric",
                                            min: 0,
                                        },
                                    }}
                                    sx={{ ...compactControlSx, width: 154 }}
                                />

                                <HelpTextField
                                    label="Min Actionable Abs Level"
                                    tooltip="Minimum absolute vPoint level decision.v19 or decision.v20 may enter. Default 2; minimum 1. Only decision.v19 treats the level immediately below this value as projection-only."
                                    type="number"
                                    size="small"
                                    value={backtestConfig.minActionableAbsoluteLevel ?? 0}
                                    onChange={(e) =>
                                        updateBacktest({
                                            minActionableAbsoluteLevel: Math.max(
                                                1,
                                                Math.floor(Number(e.target.value) || 0),
                                            ),
                                        })
                                    }
                                    slotProps={{
                                        htmlInput: {
                                            step: "1",
                                            inputMode: "numeric",
                                            min: 1,
                                        },
                                    }}
                                    sx={{ ...compactControlSx, width: 174 }}
                                />

                                {backtestConfig.tradingMode === TradingMode.FUTURES && (
                                    <>
                                        <HelpTextField
                                            label="Max Leverage"
                                            tooltip="Applied to futures backtest. Caps the leverage after the engine maps amountProbab into leverage. Set 0 to use the engine calculation."
                                            type="number"
                                            size="small"
                                            value={backtestConfig.maxLeverage ?? 0}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    maxLeverage: Number(e.target.value) || 0,
                                                })
                                            }
                                            sx={{ ...compactControlSx, width: 124 }}
                                        />
                                        <HelpTextField
                                            label="Exact Leverage"
                                            tooltip="Forces this exact leverage for every futures entry, overriding engine and Max Leverage values. Set 0 to use the normal calculation."
                                            type="number"
                                            size="small"
                                            value={backtestConfig.exactLeverage ?? 0}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    exactLeverage: Math.max(
                                                        0,
                                                        Math.floor(Number(e.target.value) || 0),
                                                    ),
                                                })
                                            }
                                            slotProps={{
                                                htmlInput: {
                                                    step: "1",
                                                    inputMode: "numeric",
                                                    min: 0,
                                                },
                                            }}
                                            sx={{ ...compactControlSx, width: 132 }}
                                        />
                                    </>
                                )}

                                <Box sx={{ minWidth: 190, width: { xs: "100%", sm: 220 } }}>
                                    <CoinMultiSelect
                                        value={backtestConfig.symbols}
                                        onChange={handleSymbolsChange}
                                        showLength={3}
                                    />
                                </Box>

                                <FormControl size="small" sx={{ ...compactControlSx, width: 112 }}>
                                    <InputLabel>Range</InputLabel>
                                    <Select
                                        value={backtestConfig.range}
                                        label="Range"
                                        onChange={(e) => {
                                            updateBacktest({
                                                range: e.target.value,
                                                startTime: undefined,
                                                endTime: undefined,
                                            });
                                        }}
                                        size="small"
                                    >
                                        {TIME_RANGE.map((item) => (
                                            <MenuItem key={item} value={item}>
                                                {item}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {backtestConfig.range === "custom" && (
                                    <>
                                        <TextField
                                            label="Start Time"
                                            type="datetime-local"
                                            fullWidth
                                            size="small"
                                            value={msToLocalInput(backtestConfig.startTime)}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    startTime: localInputToMs(e.target.value),
                                                    range: "custom",
                                                })
                                            }
                                            sx={{ ...compactControlSx, width: 210 }}
                                            slotProps={{ htmlInput: { shrink: "true" } }}
                                        />

                                        <TextField
                                            label="End Time"
                                            type="datetime-local"
                                            fullWidth
                                            size="small"
                                            value={msToLocalInput(backtestConfig.endTime)}
                                            onChange={(e) =>
                                                updateBacktest({
                                                    endTime: localInputToMs(e.target.value),
                                                    range: "custom",
                                                })
                                            }
                                            sx={{ ...compactControlSx, width: 210 }}
                                            slotProps={{ htmlInput: { shrink: "true" } }}
                                        />
                                    </>
                                )}

                                <HeaderMetrics
                                    title={
                                        <Typography sx={{ whiteSpace: "nowrap" }}>
                                            Fresh?
                                        </Typography>
                                    }
                                    sx={{ minWidth: 88 }}
                                >
                                    {(expand) => (
                                        <>
                                            {expand && (
                                                <>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={backtestConfig.upToDateKlines}
                                                                onChange={(e) =>
                                                                    handleChange(
                                                                        "upToDateKlines",
                                                                        e.target.checked
                                                                    )
                                                                }
                                                                size="small"
                                                            />
                                                        }
                                                        label="Refresh volatility data"
                                                    />

                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={
                                                                    backtestConfig.upToDateDecisionBacktest
                                                                }
                                                                onChange={(e) =>
                                                                    handleChange(
                                                                        "upToDateDecisionBacktest",
                                                                        e.target.checked
                                                                    )
                                                                }
                                                                size="small"
                                                            />
                                                        }
                                                        label="Fresh dynamic backtest"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                </HeaderMetrics>
                            </Box>
                        </Grid>
                    </Grid>
                }
            >
                {(expand) => (
                    <>
                        {expand && (
                            <Box>
                                <Box
                                    sx={{
                                        border: "1px solid rgba(0,0,0,0.06)",
                                        borderRadius: 1,
                                        p: 1,
                                        mb: 1,
                                        backgroundColor: "white",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            mb: 1,
                                            p: 1,
                                            borderRadius: "5px",
                                        }}
                                    >
                                        <Grid container spacing={2}>
                                            <Grid size={4}>
                                                <Typography variant="body1" gutterBottom>
                                                    Safe Haven
                                                </Typography>

                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        gap: 1,
                                                    }}
                                                >
                                                    <TextField
                                                        label="Safe USDT Per Month"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={
                                                            backtestConfig.modelConfig.safeUSDTPerMonth
                                                        }
                                                        onChange={(e) =>
                                                            updateModelConfig({
                                                                safeUSDTPerMonth:
                                                                    Number(e.target.value) || 0,
                                                            })
                                                        }
                                                    />

                                                    <TextField
                                                        label="Safe Percent Per Month"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={
                                                            backtestConfig.modelConfig.safePercentPerMonth
                                                        }
                                                        onChange={(e) =>
                                                            updateModelConfig({
                                                                safePercentPerMonth:
                                                                    Number(e.target.value) || 0,
                                                            })
                                                        }
                                                    />

                                                    <TextField
                                                        label="Minimal Asset On Trade"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={
                                                            backtestConfig.modelConfig.minimalAssetOnTrade
                                                        }
                                                        onChange={(e) =>
                                                            updateModelConfig({
                                                                minimalAssetOnTrade:
                                                                    Number(e.target.value) || 0,
                                                            })
                                                        }
                                                    />
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </Box>

                                    <Divider sx={{ my: 2 }} />

                                    <Grid container spacing={3} alignItems="center">
                                        {/* params row 1 */}
                                        <Grid size={{ md: 1 }}>
                                            <TextField
                                                label="Take Profit %"
                                                type="number"
                                                fullWidth
                                                size="small"
                                                value={backtestConfig.modelConfig.takeProfitPercent}
                                                onChange={(e) =>
                                                    updateModelConfig({
                                                        takeProfitPercent: Number(e.target.value) || 0,
                                                    })
                                                }
                                            />
                                        </Grid>

                                        <Grid size={{ md: 1 }}>
                                            <TextField
                                                label="Stop Loss %"
                                                type="number"
                                                fullWidth
                                                size="small"
                                                helperText="0 disables"
                                                slotProps={{
                                                    htmlInput: {
                                                        step: "1",
                                                        inputMode: "decimal",
                                                        min: 0,
                                                        max: 99,
                                                    },
                                                }}
                                                value={
                                                    backtestConfig.modelConfig.stopLossPercent ?? ""
                                                }
                                                onChange={(e) => {
                                                    const value =
                                                        Number(e.target.value) || undefined;

                                                    updateModelConfig({
                                                        stopLossPercent: value,
                                                    });
                                                }}
                                            />
                                        </Grid>

                                        <Grid size={{ md: 1 }}>
                                            <TextField
                                                fullWidth
                                                helperText="After target; 0 disables"
                                                label="Target-Zone SL %"
                                                onChange={(e) =>
                                                    updateModelConfig({
                                                        volatilityTargetStopLossPercent:
                                                            Number(e.target.value) || 0,
                                                    })
                                                }
                                                size="small"
                                                slotProps={{
                                                    htmlInput: {
                                                        inputMode: "decimal",
                                                        max: 99,
                                                        min: 0,
                                                        step: "0.1",
                                                    },
                                                }}
                                                type="number"
                                                value={
                                                    backtestConfig.modelConfig
                                                        .volatilityTargetStopLossPercent ?? 0
                                                }
                                            />
                                        </Grid>

                                        <Grid size={{ md: 2 }}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={Boolean(
                                                            backtestConfig.modelConfig.useStopLossPlus
                                                        )}
                                                        onChange={(e) =>
                                                            updateModelConfig({
                                                                useStopLossPlus: e.target.checked,
                                                            })
                                                        }
                                                        size="small"
                                                    />
                                                }
                                                label="Use StopLoss+ (live only)"
                                            />
                                            <Typography
                                                variant="caption"
                                                color="textSecondary"
                                                display="block"
                                            >
                                                Ignored by volatility-point backtest.
                                            </Typography>
                                        </Grid>
                                    </Grid>

                                    <Box sx={{ mt: 2, maxWidth: 640 }}>
                                        <Typography fontWeight={700} variant="body2">
                                            Post-average Rescue Exit
                                        </Typography>
                                        <Typography
                                            color="text.secondary"
                                            display="block"
                                            mb={1}
                                            variant="caption"
                                        >
                                            Requires favorable distance of at least the global
                                            volatility threshold.
                                        </Typography>
                                        <PostAverageRescueExitSettings
                                            onChange={(postAverageRescueExit) =>
                                                updateModelConfig({ postAverageRescueExit })
                                            }
                                            value={
                                                backtestConfig.modelConfig.postAverageRescueExit
                                            }
                                        />
                                    </Box>
                                    <Box sx={{ mt: 2, maxWidth: 640 }}>
                                        <Typography fontWeight={700} variant="body2">
                                            Post-average Stop Loss
                                        </Typography>
                                        <Typography
                                            color="text.secondary"
                                            display="block"
                                            mb={1}
                                            variant="caption"
                                        >
                                            After averaging, exit at the first active fee-aware
                                            percentage or USDT loss boundary.
                                        </Typography>
                                        <PostAverageStopLossSettings
                                            onChange={(nextPostAverageStopLoss) =>
                                                updateModelConfig({
                                                    postAverageStopLoss: nextPostAverageStopLoss,
                                                })
                                            }
                                            value={
                                                backtestConfig.modelConfig.postAverageStopLoss
                                            }
                                        />
                                    </Box>
                                </Box>
                            </Box>
                        )}
                    </>
                )}
            </HeaderMetrics>
        </Box>
    );
}
