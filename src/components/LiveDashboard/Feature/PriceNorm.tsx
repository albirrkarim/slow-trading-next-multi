"use client";

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import axios from "axios";
import { useEffect, useState } from "react";
import { delayExecution, queueExecution } from "@/components/client/utils";

import { endpoints } from "@/components/endpoints";
import { tradeLog } from "@/lib/trading/helper/log";
import { type LeveledMarkers } from "@/components/LiveDashboard/converter";
import { type DashboardConfig } from "../LiveDashboardPage";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import type { ExchangeType } from "@/lib/exchange";

interface ChartData {
    series: LeveledMarkers[][];
    names: string[];
}

interface PriceNormFeatureProps {
    symbols: string[];
    config: DashboardConfig;
    exchangeType: ExchangeType;
}

export default function PriceNormFeature({
    symbols,
    config,
    exchangeType,
}: PriceNormFeatureProps) {
    const [data, setData] = useState<ChartData | null>(null);

    const [loading, setLoading] = useState(false);

    const execute = async (forceUpdate = false) => {
        setLoading(true);
        try {
            setData(null);

            // A. Get all the data
            // whcih activae coins
            const resp0 = await axios.post<{ data: ChartData }>(
                endpoints.slow.dev.priceNorm,
                {
                    symbols,
                    startTime: config.startTime,
                    endTime: config.endTime,
                    forceUpdate,
                    exchangeType,
                },
            );

            const raw = resp0.data.data;

            setData(raw);
        } catch (error) {
            tradeLog.error(error);
            alert("Execution failed");
        } finally {
            setLoading(false);
        }
    };

    // Run once after mount
    useEffect(() => {
        delayExecution(
            () => {
                queueExecution(execute, 1000, "dashboard");
            },
            500,
            "price-norm",
        );
        // eslint-disable-next-line
    }, [config]);

    // -------------------- Render --------------------

    return (
        <Box>
            <Button
                startIcon={loading ? <CircularProgress size={16} /> : null}
                disabled={loading}
                onClick={() => execute(true)}
                variant="outlined"
            >
                Force update price norm
            </Button>

            {loading && <Typography>Loading ..</Typography>}
            {data && <MultiLineTimelined series={data.series} names={data.names} />}
        </Box>
    );
}
