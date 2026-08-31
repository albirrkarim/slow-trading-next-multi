"use client";

import type { MeanWaitingResult } from "@/lib/dynamic";
import { formatDuration } from "@/lib/dynamic/client";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    Grid,
    List,
    ListItem,
    ListItemText,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Typography
} from "@mui/material";
import IconButtonTooltip from "../../ui/IconButtonTooltip";
import HeaderMetrics from "./HeaderMetrics";

interface Props {
    result: MeanWaitingResult;
}

/**
 * MeanWaitingReport using HeaderMetrics pattern.
 * Header shows compact metrics; details are mounted only when expanded.
 */
export default function VolatilityStats({ result }: Props) {
    const tb = result.topToBottom;
    const bt = result.bottomToTop;

    return (
        <HeaderMetrics
            title={
                <>
                    <IconButtonTooltip tooltipTitle="Volatility" size="small" sx={{ mr: 2 }}>
                        <QueryStatsIcon />
                    </IconButtonTooltip>

                    {/* TOP->BOTTOM summary */}
                    <Button color="inherit" startIcon={<AccessTimeIcon fontSize="small" />} component="div">
                        <Typography variant="body2">
                            T→B:{" "}
                            <strong>{tb.meanHumanRounded ?? formatDuration(tb.meanMs)}</strong>
                        </Typography>
                        <Chip size="small" label={`pairs ${tb.count}`} sx={{ ml: 1 }} />
                    </Button>

                    {/* BOTTOM->TOP summary */}
                    <Button color="inherit" startIcon={<AccessTimeIcon fontSize="small" />} component="div">
                        <Typography variant="body2">
                            B→T:{" "}
                            <strong>{bt.meanHumanRounded ?? formatDuration(bt.meanMs)}</strong>
                        </Typography>
                        <Chip size="small" label={`pairs ${bt.count}`} sx={{ ml: 1 }} />
                    </Button>
                </>
            }
        >
            {(expanded) => (
                <>
                    {expanded && (
                        <Box sx={{ my: 1 }}>
                            <Grid container spacing={2}>
                                {/* TOP -> BOTTOM details */}
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="subtitle2" gutterBottom>
                                                TOP → BOTTOM
                                            </Typography>

                                            <Table size="small">
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell>Count</TableCell>
                                                        <TableCell>{tb.count}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Mean (ms)</TableCell>
                                                        <TableCell>{tb.meanMs ? tb.meanMs.toFixed(0) : "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Mean (human)</TableCell>
                                                        <TableCell>{tb.meanHuman ?? "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Rounded mean</TableCell>
                                                        <TableCell>{formatDuration(tb.meanMsRounded)}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Skips total</TableCell>
                                                        <TableCell>{tb.skipsTotal ?? 0}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Avg skips / pair</TableCell>
                                                        <TableCell>{tb.meanCountSkip ?? "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Skip max</TableCell>
                                                        <TableCell>{tb.skipMax ?? 0}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>

                                            <Divider sx={{ my: 1 }} />

                                            <Typography variant="subtitle2" gutterBottom>
                                                Durations (recent)
                                            </Typography>

                                            <List dense sx={{ maxHeight: 160, overflow: "auto" }}>
                                                {tb.durationsMs && tb.durationsMs.length ? (
                                                    tb.durationsMs.map((d, i) => (
                                                        <ListItem key={i} divider>
                                                            <ListItemText primary={d} />
                                                        </ListItem>
                                                    ))
                                                ) : (
                                                    <ListItem>
                                                        <ListItemText primary="No pairs found" />
                                                    </ListItem>
                                                )}
                                            </List>
                                        </CardContent>
                                    </Card>
                                </Grid>

                                {/* BOTTOM -> TOP details */}
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="subtitle2" gutterBottom>
                                                BOTTOM → TOP
                                            </Typography>

                                            <Table size="small">
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell>Count</TableCell>
                                                        <TableCell>{bt.count}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Mean (ms)</TableCell>
                                                        <TableCell>{bt.meanMs ? bt.meanMs.toFixed(0) : "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Mean (human)</TableCell>
                                                        <TableCell>{bt.meanHuman ?? "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Rounded mean</TableCell>
                                                        <TableCell>{formatDuration(bt.meanMsRounded)}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Skips total</TableCell>
                                                        <TableCell>{bt.skipsTotal ?? 0}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Avg skips / pair</TableCell>
                                                        <TableCell>{bt.meanCountSkip ?? "—"}</TableCell>
                                                    </TableRow>

                                                    <TableRow>
                                                        <TableCell>Skip max</TableCell>
                                                        <TableCell>{bt.skipMax ?? 0}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>

                                            <Divider sx={{ my: 1 }} />

                                            <Typography variant="subtitle2" gutterBottom>
                                                Durations (recent)
                                            </Typography>

                                            <List dense sx={{ maxHeight: 160, overflow: "auto" }}>
                                                {bt.durationsMs && bt.durationsMs.length ? (
                                                    bt.durationsMs.map((d, i) => (
                                                        <ListItem key={i} divider>
                                                            <ListItemText primary={d} />
                                                        </ListItem>
                                                    ))
                                                ) : (
                                                    <ListItem>
                                                        <ListItemText primary="No pairs found" />
                                                    </ListItem>
                                                )}
                                            </List>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </>
            )}
        </HeaderMetrics>
    );
}
