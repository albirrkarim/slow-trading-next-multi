"use client";

import { type Kline } from "@/lib/exchange/platform/tokocrypto";
import { type Marker } from "@/components/LiveDashboard/converter";
import {
    CandlestickSeries,
    createChart,
    createSeriesMarkers,
    HistogramSeries,
    type UTCTimestamp,
} from "lightweight-charts";
import React, { useEffect, useRef, type JSX } from "react";
import { delayExecution } from "../../client/utils";
import { tradeLog } from "@/lib/trading/helper/log";

interface TradeHistoryViewProps {
    klines: Kline[]
    markers: Marker[]
}

function unixToJakartaTZUTC(unixMs: number): UTCTimestamp {
    return Math.floor(unixMs / 1000) as UTCTimestamp;
}

const HEIGHT = 400

const KlinesAndMarkers = React.memo(
    ({ klines, markers }: TradeHistoryViewProps): JSX.Element => {
        const chartContainerRef = useRef<HTMLDivElement | null>(null);

        useEffect(() => {
            const initialize = async () => {
                try {
                    tradeLog.log("initialize");

                    const candlestickData = klines.map((k) => ({
                        time: unixToJakartaTZUTC(k[0]),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                    }));

                    const volumeData = klines.map((k) => ({
                        time: unixToJakartaTZUTC(k[0]),
                        value: parseFloat(k[5]),
                        color:
                            parseFloat(k[4]) >= parseFloat(k[1])
                                ? "rgba(0, 150, 0, 0.5)"
                                : "rgba(255, 0, 0, 0.5)",
                    }));

                    if (chartContainerRef.current) {
                        const chart = createChart(chartContainerRef.current, {
                            height: HEIGHT,
                            layout: {
                                background: { color: "#ffffff" },
                                textColor: "#000",
                            },
                        });

                        const candleSeries = chart.addSeries(CandlestickSeries, {
                            priceScaleId: "right",
                        });
                        candleSeries.setData(candlestickData);

                        const volumeSeries = chart.addSeries(HistogramSeries, {
                            priceScaleId: "",
                            priceFormat: { type: "volume" },
                        });
                        volumeSeries.setData(volumeData);

                        volumeSeries.priceScale().applyOptions({
                            scaleMargins: { top: 0.8, bottom: 0 },
                        });

                        candleSeries.priceScale().applyOptions({
                            scaleMargins: { top: 0.1, bottom: 0.3 },
                        });

                        chart.timeScale().applyOptions({
                            timeVisible: true,
                        });

                        // always sort
                        markers.sort((a, b) => a.time - b.time);

                        createSeriesMarkers(candleSeries, markers);

                        chart.timeScale().fitContent();
                    }
                } catch (error) {
                    tradeLog.error("Failed to fetch klines:", error);
                }
            };

            delayExecution(() => {
                initialize();
            }, 1000)

            // eslint-disable-next-line
        }, []);

        return (
            <div
                ref={chartContainerRef}
                style={{ width: "100%", }}
            />
        );
    },
    // custom comparison: only re-render if tradeHistory changes
    (prev, next) => JSON.stringify(prev.markers) === JSON.stringify(next.markers)
);

export default KlinesAndMarkers