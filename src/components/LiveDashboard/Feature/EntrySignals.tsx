import { endpoints } from "@/components/endpoints";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import type { ExchangeType } from "@/lib/exchange";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    IconButton,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import axios from "axios";
import { useCallback, useState } from "react";
import { tradeLog } from "@/lib/trading/helper/log";

interface EntrySignalsProps {
    defaultExpanded?: boolean;
    exchangeType: ExchangeType;
}

export default function EntrySignals({
    defaultExpanded = true,
    exchangeType,
}: EntrySignalsProps) {
    const [signals, setSignals] = useState<EntryRecommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const [bypass, setBypass] = useState(false);
    const [timeTook, setTimeTook] = useState(0);
    const [firstRun, setFirstRun] = useState(false);

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        try {
            setSignals([]);
            const startTime = performance.now();
            const res = await axios.post<{ entrySignals: EntryRecommendation[] }>(
                endpoints.slow.prod.signal,
                {
                    bypass,
                },
            );

            setFirstRun(true);
            if (res.data && res.data.entrySignals) {
                setSignals(res.data.entrySignals);
            }
            setTimeTook(performance.now() - startTime);
        } catch (error) {
            tradeLog.error("Failed to fetch signals", error);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bypass, exchangeType]);

    // useEffect(() => {
    //     delayExecution(() => {
    //         queueExecution(fetchSignals, 500, "dashboard");
    //     }, 500, "entry-signals")

    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [bypass, exchangeType]);

    return (
        <HeaderMetrics
            defaultExpanded={defaultExpanded}
            headerCanBeClicked
            rememberExpand="entry-signal"
            title={
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                    Entry Signals ({signals.length})
                </Typography>
            }
        >
            {(expanded) =>
                expanded && (
                    <Box
                        sx={{
                            maxHeight: "400px",
                            mt: 1,
                            overflowY: "auto",
                        }}
                    >
                        <Box
                            onClick={(event) => event.stopPropagation()}
                            sx={{
                                alignItems: "center",
                                display: "flex",
                                gap: { xs: 0.5, sm: 1 },
                            }}
                        >
                            <Typography variant="caption">
                                Time took: {(timeTook / 1000).toFixed(2)} s
                            </Typography>

                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={bypass}
                                        onChange={(e) => setBypass(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={<Typography variant="caption">Bypass</Typography>}
                                sx={{ m: 0 }}
                            />

                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void fetchSignals();
                                }}
                                disabled={loading}
                                size="small"
                            >
                                {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                            </IconButton>
                        </Box>
                        <Stack spacing={1.5}>
                            {signals.map((signal, index) => (
                                <Paper
                                    key={index}
                                    variant="outlined"
                                    sx={{
                                        backgroundColor: "background.paper",
                                        borderLeft:
                                            signal.l === "B"
                                                ? "4px solid #4caf50"
                                                : "4px solid #f44336",
                                        p: 1,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            alignItems: "center",
                                            display: "flex",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <Typography variant="subtitle1" component="div">
                                            {signal.symbol} | Level: <strong>{signal.lvl}</strong>{" "}
                                            Prob:{" "}
                                            <strong>{(signal.amountProbab || 0).toFixed(2)}</strong>
                                        </Typography>

                                        <Chip
                                            label={signal.l}
                                            size="small"
                                            color={signal.l === "B" ? "success" : "error"}
                                        />
                                    </Box>
                                </Paper>
                            ))}

                            {!firstRun && (
                                <Paper
                                    variant="outlined"
                                    sx={{ color: "text.secondary", p: 2, textAlign: "center" }}
                                >
                                    <Typography variant="body2">
                                        Click refresh to first run
                                    </Typography>
                                </Paper>
                            )}

                            {signals.length === 0 && !loading && (
                                <Paper
                                    variant="outlined"
                                    sx={{ color: "text.secondary", p: 2, textAlign: "center" }}
                                >
                                    <Typography variant="body2">
                                        No entry signals found
                                    </Typography>
                                </Paper>
                            )}
                        </Stack>
                    </Box>
                )
            }
        </HeaderMetrics>
    );
}
