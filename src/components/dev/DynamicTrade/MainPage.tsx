"use client";

import type { DynamicTradeBacktestReturn } from "@/components/api/dynamic/api-dynamic-type";
import SidebarButton from "@/components/ui/SidebarButton";
import { tradeLog } from "@/lib/trading/helper/log";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    TextField,
    Typography,
} from "@mui/material";
import axios from "axios";
import md5 from "md5";
import { useEffect, useState } from "react";
import { deepCopy, delayExecution } from "../../client/utils";
import { endpoints } from "../../endpoints";
import DynamicBacktestConfig, {
    type BacktestConfig,
    DEFAULT_BACKTEST_CONFIG,
} from "./Config";
import DebugEvaluation from "./Debug/Evaluation";
import DebugKlines from "./Debug/Klines";
import DebugSeries from "./Debug/Series";
import HistoryBTestConfig from "./Leaderboards/HistoryBTestConfig";
import { type SavedPayload } from "./type-dynamic-report";
import { blue } from "@mui/material/colors";
import BacktestDailyPnlCalendar from "./BacktestDailyPnlCalendar";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import backtestRequestConfig from "./backtest-request-config";

const BACKTEST_KEY = "dynamic";

function normalizeModelConfig(
    raw: Partial<BacktestConfig["modelConfig"]> | undefined,
): BacktestConfig["modelConfig"] {
    const modelConfig = {
        ...DEFAULT_BACKTEST_CONFIG.modelConfig,
        ...(raw ?? {}),
    };
    const {
        takeProfitPercent,
        stopLossPercent,
        volatilityTargetStopLossPercent,
        postAverageRescueExit,
        postAverageStopLoss: rawPostAverageStopLoss,
        maxHoldMinutes,
        orderType,
        useStopLossPlus,
        stopLossPlusTrigger,
        balanceUSDT,
        maxRiskPercent,
        maxBuyUSDT,
        onlyTPFromDate,
        dcaDipPercent,
        maxDcaRounds,
        confidenceBase,
        safeUSDTPerMonth,
        safePercentPerMonth,
        minimalAssetOnTrade,
    } = modelConfig;

    return {
        takeProfitPercent,
        stopLossPercent,
        volatilityTargetStopLossPercent,
        postAverageRescueExit:
            postAverageRescue.config.normalize(postAverageRescueExit),
        postAverageStopLoss:
            postAverageStopLoss.config.normalize(rawPostAverageStopLoss),
        maxHoldMinutes,
        orderType,
        useStopLossPlus,
        stopLossPlusTrigger,
        balanceUSDT,
        maxRiskPercent,
        maxBuyUSDT,
        onlyTPFromDate,
        dcaDipPercent,
        maxDcaRounds,
        confidenceBase,
        safeUSDTPerMonth,
        safePercentPerMonth,
        minimalAssetOnTrade,
    };
}

type BacktestConfigInput = Partial<BacktestConfig> & {
    config?: Partial<BacktestConfig>;
    seasonalModelConfig?: BacktestConfig["modelConfig"][];
};

type BacktestConfigEnvelope = BacktestConfigInput & {
    backtestConfig?: BacktestConfigInput;
};

export function normalizeBacktestConfig(raw: unknown): BacktestConfig {
    const rawConfig =
        raw && typeof raw === "object"
            ? raw as BacktestConfigEnvelope
            : {};
    const config: BacktestConfigInput =
        rawConfig.backtestConfig &&
            typeof rawConfig.backtestConfig === "object"
            ? rawConfig.backtestConfig
            : rawConfig;

    const {
        config: nestedRuntimeConfig,
        seasonalModelConfig,
        ...outerConfig
    } = config;
    const runtimeConfig =
        nestedRuntimeConfig && typeof nestedRuntimeConfig === "object"
            ? nestedRuntimeConfig
            : {};

    return {
        ...DEFAULT_BACKTEST_CONFIG,
        ...outerConfig,
        ...runtimeConfig,
        modelConfig: normalizeModelConfig(
            runtimeConfig.modelConfig ??
            outerConfig.modelConfig ??
            seasonalModelConfig?.[0] ??
            DEFAULT_BACKTEST_CONFIG.modelConfig,
        ),
    };
}

export default function DynamicTradeAnalytics() {
    const before = localStorage.getItem(BACKTEST_KEY);

    const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>(
        before ? normalizeBacktestConfig(JSON.parse(before)) : DEFAULT_BACKTEST_CONFIG
    );

    const [data, setData] = useState<DynamicTradeBacktestReturn | null>(null); // adapt type to your backend
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);

    // history state
    const [history, setHistory] = useState<SavedPayload[]>([]);

    // manual JSON input
    const [manualJson, setManualJson] = useState<string>("");

    // persist view config to localStorage (existing behavior)
    useEffect(() => {
        delayExecution(() => {
            try {
                localStorage.setItem(BACKTEST_KEY, JSON.stringify(backtestConfig));
            } catch {
                /* ignore */
            }
        }, 1000);
    }, [backtestConfig]);

    function makeId(backtest: BacktestConfig): string {
        try {
            return md5(JSON.stringify(backtest)).toString().substring(0, 5);
        } catch {
            return `${Date.now()}`;
        }
    }

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const resp = await axios.get<SavedPayload[]>(
                endpoints.dev.dynamicTrade.leaderboards
            );
            setHistory(Array.isArray(resp.data) ? resp.data : []);
        } catch (err) {
            tradeLog.warn("Failed to load leaderboard history:", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // save a payload into persistent history, unique by signature
    const saveHistory = async (
        backtest: BacktestConfig,
        backtestResult: DynamicTradeBacktestReturn
    ) => {
        try {
            const id = makeId(backtest);
            // find existing
            const existingIdx = history.findIndex((h) => h.id === id);
            let next: SavedPayload[] = [];
            if (existingIdx >= 0) {
                // move to top and refresh timestamp
                const existing = history[existingIdx];
                const updated: SavedPayload = {
                    ...existing,
                    // backtestResult,
                    leaderboards: backtestResult.leaderboards ?? {},
                    createdAt: Date.now(),
                };
                next = [updated, ...history.filter((_, i) => i !== existingIdx)];
            } else {
                const entry: SavedPayload = {
                    id,
                    createdAt: Date.now(),
                    backtestConfig: backtest,
                    label: `${backtest.symbols.join(", ")} · ${backtest.range}`,
                    // backtestResult,
                    leaderboards: backtestResult.leaderboards ?? {},
                };
                next = [entry, ...history];
            }
            const resp = await axios.post<SavedPayload[]>(
                endpoints.dev.dynamicTrade.leaderboards,
                next[0]
            );
            setHistory(Array.isArray(resp.data) ? resp.data : next);
        } catch (err) {
            tradeLog.warn("Failed to save config history:", err);
        }
    };

    const deleteHistoryItem = async (id: string) => {
        setHistoryLoading(true);
        try {
            const resp = await axios.delete<SavedPayload[]>(
                endpoints.dev.dynamicTrade.leaderboards,
                { data: { id } }
            );
            setHistory(Array.isArray(resp.data) ? resp.data : []);
        } catch (err) {
            tradeLog.warn("Failed to delete leaderboard history:", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // execute backtest & save payload to history after success
    const execute = async (customConfig?: BacktestConfig) => {
        setLoading(true);
        try {
            setData(null);

            const usedConfig = normalizeBacktestConfig(
                customConfig ?? backtestConfig,
            );
            const usedConfigBefore = deepCopy(usedConfig);

            const realBackendConfig = deepCopy(usedConfig);

            // derive start/end time in ms based on selected range
            const computeRangeMs = (
                range: string
            ): { startTime: number; endTime: number } => {
                const now = new Date();
                const endTime = now.getTime();
                const match = range.match(/^(\d+)(month|year)$/);
                if (!match) {
                    // fallback to 1year if unknown
                    const fallback = new Date(now);
                    fallback.setFullYear(fallback.getFullYear() - 1);
                    return { startTime: fallback.getTime(), endTime };
                }
                const amount = Number(match[1]);
                const unit = match[2];
                const start = new Date(now);
                if (unit === "month") {
                    start.setMonth(start.getMonth() - amount);
                } else {
                    start.setFullYear(start.getFullYear() - amount);
                }
                return { startTime: start.getTime(), endTime };
            };

            const hasCustomTime =
                typeof usedConfig.startTime === "number" &&
                usedConfig.startTime > 0 &&
                typeof usedConfig.endTime === "number" &&
                usedConfig.endTime > 0;

            const { startTime, endTime } = hasCustomTime
                ? {
                    startTime: usedConfig.startTime as number,
                    endTime: usedConfig.endTime as number,
                }
                : computeRangeMs(usedConfig.range);

            // build payload exactly as requested
            const payload = {
                mode: usedConfig.mode,

                symbols: usedConfig.symbols,
                range: usedConfig.range,
                algorithm: usedConfig.algorithm,
                startTime,
                endTime,

                decisionEngineVersion: usedConfig.decisionEngineVersion,

                upToDateKlines: usedConfig.upToDateKlines,
                upToDateDecisionBacktest: usedConfig.upToDateDecisionBacktest,

                config: backtestRequestConfig.config.build(realBackendConfig),
            };

            tradeLog.log("Sending payload:", JSON.stringify(payload, null, 2));

            const resp = await axios.post<DynamicTradeBacktestReturn>(
                endpoints.dev.dynamicTrade.backtest,
                payload
            );

            setData(resp.data);

            // save to history (we save the view and the backtest config)
            await saveHistory(usedConfigBefore, resp.data);

            tradeLog.log("VolatilityMap response:", resp.data);
        } catch (e) {
            tradeLog.error(e);
            alert("Execution failed");
        } finally {
            setLoading(false);
        }
    };

    // parse manual json - accept either { symbols, range, config } OR { view, backtestConfig }
    const parseManualJsonAndLoad = (text: string): BacktestConfig | null => {
        try {
            const parsed = JSON.parse(text);
            // server payload shape?
            if (parsed) {
                const normalizedConfig = normalizeBacktestConfig(parsed);
                setBacktestConfig(normalizedConfig);
                alert("Loaded JSON into UI");
                return normalizedConfig;
            }

            throw new Error("Unrecognized payload shape");
        } catch (err: any) {
            tradeLog.error(err);
            alert("Failed to parse JSON: " + (err?.message ?? ""));
            return null;
        }
    };

    const runManualJson = async (text: string) => {
        const normalizedConfig = parseManualJsonAndLoad(text);
        if (!normalizedConfig) return;
        await execute(normalizedConfig);
    };

    // useEffect(() => {
    //     // initial auto-execute (same as before)
    //     delayExecution(
    //         () => {
    //             queueExecution(
    //                 () => {
    //                     execute({
    //                         ...backtestConfig,
    //                         upToDateKlines: false, // initial run doesn't request fresh klines by default
    //                     });
    //                 },
    //                 2000,
    //                 "dynamic-trade"
    //             );
    //         },
    //         500,
    //         JSON.stringify(backtestConfig)
    //     );
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, []);

    return (
        <Box>
            <Box
                sx={{
                    py: 1,
                    px: 0.5,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    alignItems: "center",
                    backgroundColor: blue[500],
                    color: "white",
                }}
            >
                <Typography variant="h6">
                    <SidebarButton /> Dynamic Trade - Using volatility rail
                </Typography>

                <Box
                    sx={{
                        p: 0.5,
                        gap: 1,
                        borderRadius: "5px",
                        display: "flex",
                        backgroundColor: "white",
                    }}
                >
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        {/* Manual JSON input (multiline) */}
                        <TextField
                            value={manualJson}
                            onChange={(e) => setManualJson(e.target.value)}
                            placeholder='{ "symbols": [...], "range": "1year", }'
                            size="small"
                            sx={{ width: 300, mr: 1 }}
                        />

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                                const normalizedConfig =
                                    parseManualJsonAndLoad(manualJson);
                                if (normalizedConfig) setManualJson("");
                            }}
                        >
                            Load JSON
                        </Button>

                        <Button
                            variant="contained"
                            size="small"
                            onClick={() => runManualJson(manualJson)}
                            disabled={loading}
                            sx={{ ml: 0.5 }}
                        >
                            {loading ? <CircularProgress size={16} /> : "Run JSON"}
                        </Button>

                        <HistoryBTestConfig
                            history={history}
                            historyLoading={historyLoading}
                            deleteHistoryItem={deleteHistoryItem}
                            loadHistory={loadHistory}
                            onApplyConfig={setBacktestConfig}
                            onRunConfig={execute}
                        />

                        <BacktestDailyPnlCalendar data={data} />

                        <Divider orientation="vertical" flexItem />

                        {/* regular execute */}
                        <IconButton
                            onClick={() => execute()}
                            color="info"
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                        </IconButton>
                    </Box>
                </Box>
            </Box>

            <DynamicBacktestConfig
                backtestConfig={backtestConfig}
                setBacktestConfig={setBacktestConfig}
            />

            {data && (
                <>
                    <DebugSeries data={data} />

                    <Divider sx={{ my: 2 }} />

                    <DebugEvaluation data={data} />

                    <Divider sx={{ my: 2 }} />

                    <DebugKlines data={data} />
                </>
            )}
        </Box>
    );
}
