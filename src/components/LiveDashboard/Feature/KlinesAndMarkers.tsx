"use client";

import { Grid, Typography } from "@mui/material";

import type {
    LeveledMarkers,
    Marker,
} from "@/components/LiveDashboard/converter";
import { COLORS_BG } from "@/components/client/constants";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import KlinesCard from "@/components/ui/KlinesCard";
import type { ExchangeType } from "@/lib/exchange";

export interface KlineMarker {
    symbols: string[];
    series: LeveledMarkers[][];
    names: string[];
    markers: Marker[][];
}

interface KlinesAndMarkersProps {
    data: KlineMarker | null;
    exchangeType: ExchangeType;
}

export default function KlinesAndMarkers({
    data,
    exchangeType,
}: KlinesAndMarkersProps) {
    return (
        <HeaderMetrics
            title={
                <Typography variant="body1" fontWeight="bold">
                    Klines and markers
                </Typography>
            }
        >
            {(expand) =>
                expand && (
                    <>
                        {data ? (
                            <Grid sx={{ my: 1 }} container spacing={2}>
                                {data.symbols.map((symbol, idx) => (
                                    <Grid key={symbol} size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
                                        <HeaderMetrics
                                            sx={{
                                                backgroundColor: COLORS_BG[idx % COLORS_BG.length],
                                                borderRadius: "5px",
                                            }}

                                            title={
                                                <Typography sx={{ color: "black", mx: 2 }}>
                                                    {symbol} Klines and markers
                                                </Typography>
                                            }
                                        >
                                            {(expandLocal) =>
                                                expandLocal && (
                                                    <KlinesCard
                                                        config={{
                                                            symbol,
                                                            range: "1month",
                                                            volatility: false,
                                                            upToDateKlines: true,
                                                            exchangeType,
                                                        }}
                                                        customMarkers={data.markers[idx]}
                                                    />
                                                )
                                            }
                                        </HeaderMetrics>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Typography>Loading ...</Typography>
                        )}
                    </>
                )
            }
        </HeaderMetrics>
    );
}
