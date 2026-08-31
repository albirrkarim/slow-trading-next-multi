"use client";

import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import { type Marker } from "@/components/LiveDashboard/converter";
import { CircularProgress } from "@mui/material";
import axios from "axios";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { delayExecution, queueExecution } from "../client/utils";
import { endpoints } from "../endpoints";
import { tradeLog } from "@/lib/trading/helper/log";

const KlinesAndMarkers = dynamic(
    async () => await import("./Chart/KlinesAndMarkers"),
    {
        ssr: false, // charts often rely on browser APIs, disable SSR
        loading: () => <p>Loading chart...</p>, // optional loading UI
    }
);

interface KlinesAndMarkersData {
    klines: Kline[];
    markers: Marker[];
}

export interface KlinesMarkerDisplayConfig {
    [key: string]: any;
    symbol: string;
    upToDateKlines?: boolean
}

interface KlinesCardProps {
    config: KlinesMarkerDisplayConfig;
    customMarkers?: Marker[];
}

export default function KlinesCard({ config, customMarkers }: KlinesCardProps) {
    const [data, setData] = useState<KlinesAndMarkersData | null>(null);
    const [loading, setLoading] = useState(true);

    const execute = async (customConfig?: KlinesMarkerDisplayConfig) => {
        setLoading(true);
        try {
            setData(null);
            const resp = await axios.post<KlinesAndMarkersData>(
                endpoints.slow.dev.klines,
                customConfig ?? config
            );

            tradeLog.log(resp.data);
            setData(resp.data);
        } catch (e) {
            tradeLog.error(e);
            alert("Execution failed");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        delayExecution(
            () => {
                queueExecution(
                    () => {
                        execute();
                    },
                    1000,
                    "trade"
                );
            },
            500,
            JSON.stringify(config)
        );
        // eslint-disable-next-line
    }, []);

    return (
        <>
            {loading && <CircularProgress size={15} color="inherit" />}

            {data && (
                <KlinesAndMarkers
                    klines={data.klines}
                    markers={[...data.markers, ...(customMarkers ?? [])]}
                />
            )}
        </>
    );
}
