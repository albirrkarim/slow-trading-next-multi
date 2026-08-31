"use client";

import { COLORS_BG } from "@/components/client/constants";

import { type DynamicTradeBacktestReturn } from "@/components/api/dynamic/api-dynamic-type";
import { Box, Button, Grid } from "@mui/material";
import KlinesCard from "../../../ui/KlinesCard";
import HeaderMetrics from "../../Evaluation/HeaderMetrics";
import { grey } from "@mui/material/colors";

export default function DebugKlines({
    data,
}: {
    data: DynamicTradeBacktestReturn;
}) {
    return (
        <HeaderMetrics
            sx={{
                backgroundColor: grey[100],
            }}
            title={
                <Button size="small" color="inherit">
                    Klines and markers
                </Button>
            }
        >
            {(expand) => (
                <>
                    {expand && (


                        <Grid container spacing={2}>
                            {data.symbols.map((symbol, idx) => (
                                <Grid
                                    key={symbol}
                                    size={{ md: 6 }}
                                    sx={{
                                        backgroundColor: COLORS_BG[idx % COLORS_BG.length],
                                        borderRadius: "5px",
                                    }}
                                >
                                    <HeaderMetrics
                                        key={symbol}
                                        title={
                                            <Button size="small" color="inherit">
                                                {symbol} Klines and markers
                                            </Button>
                                        }
                                    >
                                        {(expandChild) => (
                                            <>
                                                {expandChild && (
                                                    <Box sx={{ p: 1 }}>
                                                        <KlinesCard
                                                            config={{
                                                                symbol,
                                                                range: data.range,
                                                                volatility: true,
                                                                startTime: data.commonTime.commonStart,
                                                                endTime: data.commonTime.commonEnd,
                                                            }}
                                                        />
                                                    </Box>
                                                )}
                                            </>
                                        )}
                                    </HeaderMetrics>
                                </Grid>
                            ))}
                        </Grid>

                    )}
                </>
            )}
        </HeaderMetrics>
    );
}
