"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { createChart, ColorType, CandlestickSeries, createSeriesMarkers, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import type { Marker } from "@/components/LiveDashboard/converter";
import type { Position } from "@/lib/trading/models";

type TrajectoryPoint = {
    message?: string;
    price: number;
    scenario?: string;
    time: number;
    timeHuman?: string;
};

type ActivePosition = Pick<
    Position<any>,
    "exposure" | "opened" | "strategy"
>;

type OpenOrder = {
    price?: number;
    side?: string;
    targetPrice?: number;
    time?: number;
};

type AimMarkerSource = {
    beginPrice?: number;
    beginTime?: number;
} | undefined;

const AVG_MARKER_COLOR = "#f57c00";

function activePositionToMarkers(pos: ActivePosition | undefined): Marker[] {
    if (!pos) return [];

    const markers: Marker[] = [];
    const entryTime = pos.opened.t;
    const entryPrice = pos.opened.price;

    if (
        typeof entryTime === "number" &&
        Number.isFinite(entryTime) &&
        entryTime > 0 &&
        typeof entryPrice === "number" &&
        Number.isFinite(entryPrice) &&
        entryPrice > 0
    ) {
        const entryLabel = `ENTRY ${entryPrice}`;

        markers.push({
            time: Math.floor(entryTime / 1000) as any,
            position: "belowBar",
            color: "#2962FF",
            shape: "arrowUp",
            text: "ENTRY",
            price: entryPrice,
            tooltipTitle: entryLabel,
            tooltipText: [
                new Date(entryTime).toLocaleString(),
                `Price: ${entryPrice}`,
            ].join("\n"),
        });
    }

    const executions = pos.strategy.averaging.executions ?? [];
    for (const trigger of executions) {
        if (
            !(typeof trigger.t === "number" && Number.isFinite(trigger.t) && trigger.t > 0) ||
            !(typeof trigger?.price === "number" && Number.isFinite(trigger.price) && trigger.price > 0)
        ) {
            continue;
        }

        const increaseLabel = `AVG $${trigger.marginUsdt.toFixed(2)} @ ${trigger.price}`;

        markers.push({
            time: Math.floor(trigger.t / 1000) as any,
            position: "belowBar",
            color: AVG_MARKER_COLOR,
            shape: "circle",
            text: increaseLabel,
            price: trigger.price,
            tooltipTitle: increaseLabel,
            tooltipText: [
                new Date(trigger.t).toLocaleString(),
                `Price: ${trigger.price}`,
                typeof trigger.allocationPct === "number" && Number.isFinite(trigger.allocationPct)
                    ? `Multiplier: +${trigger.allocationPct}x`
                    : null,
                typeof trigger.projectedProfitPct === "number" &&
                    Number.isFinite(trigger.projectedProfitPct)
                    ? `Projected rescue: ${trigger.projectedProfitPct.toFixed(2)}%`
                    : null,
                typeof trigger.reservedMarginUsdt === "number" &&
                    Number.isFinite(trigger.reservedMarginUsdt)
                    ? `Reserved: $${trigger.reservedMarginUsdt.toFixed(2)} USDT`
                    : null,
                `Add margin: $${trigger.marginUsdt.toFixed(2)} USDT`,
            ]
                .filter(Boolean)
                .join("\n"),
        });
    }

    const reserveSteps = executions.length === 0
        ? pos.strategy.averaging.steps
        : [];
    for (const [index, step] of reserveSteps.entries()) {
        const stepPrice = step.usedPrice;

        if (
            step.status !== "USED" ||
            !(typeof step.usedAt === "number" && Number.isFinite(step.usedAt) && step.usedAt > 0) ||
            !(typeof stepPrice === "number" && Number.isFinite(stepPrice) && stepPrice > 0)
        ) {
            continue;
        }

        const label = `AVG L${step.level ?? index + 1}`;
        markers.push({
            time: Math.floor(step.usedAt / 1000) as any,
            position: "belowBar",
            color: AVG_MARKER_COLOR,
            shape: "circle",
            text: label,
            price: stepPrice,
            tooltipTitle: label,
            tooltipText: [
                new Date(step.usedAt).toLocaleString(),
                `Price: ${stepPrice}`,
                typeof step.marginUsdt === "number"
                    ? `Add margin: $${step.marginUsdt.toFixed(2)} USDT`
                    : null,
                typeof step.allocationPct === "number"
                    ? `Multiplier: +${step.allocationPct}x`
                    : null,
            ]
                .filter(Boolean)
                .join("\n"),
        });
    }

    return markers;
}

type CandlePoint = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};
type CandleOrWhitespacePoint = CandlePoint | { time: number };
type TrajectoryDirection = "LONG" | "SHORT" | undefined;
type TrajectoryHoverState = {
    x: number;
    y: number;
    scenario: string;
    pointIndex: number;
    point: TrajectoryPoint;
    pnlPercent: number | null;
};
type MarkerHoverState = {
    x: number;
    y: number;
    title: string;
    text: string;
};

function aimPositionToMarkers(pos: AimMarkerSource): Marker[] {
    if (!pos) return [];

    const beginTimeMs = pos.beginTime;
    const beginPrice = pos.beginPrice;

    if (typeof beginTimeMs !== "number" || !Number.isFinite(beginTimeMs)) return [];

    const textPrice =
        typeof beginPrice === "number" && Number.isFinite(beginPrice)
            ? ` @ ${beginPrice}`
            : "";

    return [
        {
            time: Math.floor(beginTimeMs / 1000) as any,
            position: "belowBar",
            color: "#f9a825",
            shape: "arrowUp",
            text: `AIM START${textPrice}`,
        },
    ];
}

function countDecimals(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const s = value.toString();
    const i = s.indexOf(".");
    return i >= 0 ? s.length - i - 1 : 0;
}

function computePricePrecision(params: {
    data: Array<{ open: number; high: number; low: number; close: number }>;
    activePosition?: ActivePosition;
    aimPosition?: AimMarkerSource;
    trajectory?: TrajectoryPoint[][];
}): number {
    const { data, activePosition, aimPosition, trajectory } = params;

    let maxDecimals = 0;
    for (let i = Math.max(0, data.length - 200); i < data.length; i++) {
        const d = data[i];
        maxDecimals = Math.max(
            maxDecimals,
            countDecimals(d.open),
            countDecimals(d.high),
            countDecimals(d.low),
            countDecimals(d.close),
        );
    }

    const entryPrice = activePosition?.exposure.averageEntryPrice;
    if (typeof entryPrice === "number") {
        maxDecimals = Math.max(maxDecimals, countDecimals(entryPrice));
    }

    const beginPrice = aimPosition?.beginPrice;
    if (typeof beginPrice === "number") {
        maxDecimals = Math.max(maxDecimals, countDecimals(beginPrice));
    }

    trajectory?.flat().forEach((point) => {
        if (typeof point.price === "number") {
            maxDecimals = Math.max(maxDecimals, countDecimals(point.price));
        }
    });

    // reasonable clamp; many exchanges use up to 8 decimals
    return Math.min(Math.max(maxDecimals, 2), 8);
}

function normalizeTrajectoryTime(time: number): number | null {
    if (!Number.isFinite(time) || time <= 0) return null;

    // Decision times are unix ms, but chart coordinates are unix seconds.
    return Math.floor(time > 10_000_000_000 ? time / 1000 : time);
}

function estimateBarStepSeconds(data: Array<{ time: number }>): number {
    if (data.length < 2) {
        return 60 * 5;
    }

    const diffs = data
        .slice(-50)
        .map((item, index, arr) => {
            if (index === 0) return null;
            const diff = item.time - arr[index - 1].time;
            return Number.isFinite(diff) && diff > 0 ? diff : null;
        })
        .filter((diff): diff is number => typeof diff === "number" && diff > 0)
        .sort((a, b) => a - b);

    if (diffs.length === 0) {
        return 60 * 5;
    }

    const middle = Math.floor(diffs.length / 2);
    return diffs.length % 2 === 0
        ? Math.max(1, Math.round((diffs[middle - 1] + diffs[middle]) / 2))
        : Math.max(1, Math.round(diffs[middle]));
}

function getMaxProjectedTime(params: {
    markers?: Marker[];
    trajectory?: TrajectoryPoint[][];
    trajectoryAnchor?: { price: number; time: number };
    betterToCloseAt?: number;
}): number | null {
    const markerTimes = (params.markers ?? [])
        .map((marker) => Number(marker?.time))
        .filter((time) => Number.isFinite(time) && time > 0);
    const trajectoryTimes = (params.trajectory ?? [])
        .flat()
        .map((point) => normalizeTrajectoryTime(point.time))
        .filter((time): time is number => time !== null && time > 0);
    const anchorTime =
        typeof params.trajectoryAnchor?.time === "number"
            ? normalizeTrajectoryTime(params.trajectoryAnchor.time)
            : null;
    const betterCloseTime =
        typeof params.betterToCloseAt === "number"
            ? normalizeTrajectoryTime(params.betterToCloseAt)
            : null;
    const allTimes = [
        ...markerTimes,
        ...trajectoryTimes,
        ...(anchorTime !== null ? [anchorTime] : []),
        ...(betterCloseTime !== null ? [betterCloseTime] : []),
    ];

    return allTimes.length > 0 ? Math.max(...allTimes) : null;
}

function padDataWithFutureWhitespace(params: {
    data: CandlePoint[];
    targetTime: number | null;
}): CandleOrWhitespacePoint[] {
    const { data, targetTime } = params;

    if (data.length === 0 || targetTime === null) {
        return data;
    }

    const lastTime = data[data.length - 1]?.time;
    if (!(Number.isFinite(lastTime) && targetTime > lastTime)) {
        return data;
    }

    const stepSeconds = estimateBarStepSeconds(data);
    const padded: CandleOrWhitespacePoint[] = [...data];

    for (let time = lastTime + stepSeconds; time <= targetTime; time += stepSeconds) {
        padded.push({ time });
    }

    return padded;
}

function computeTrajectoryPnl(params: {
    entryPrice?: number;
    pointPrice: number;
    direction: TrajectoryDirection;
}): number | null {
    const { entryPrice, pointPrice, direction } = params;
    if (
        !(typeof entryPrice === "number" && Number.isFinite(entryPrice) && entryPrice > 0) ||
        !(typeof pointPrice === "number" && Number.isFinite(pointPrice) && pointPrice > 0)
    ) {
        return null;
    }

    const pnl =
        direction === "LONG"
            ? ((pointPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - pointPrice) / entryPrice) * 100;

    return Number.isFinite(pnl) ? pnl : null;
}

interface ChartProps {
    data: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
    markers?: Marker[];
    activePosition?: ActivePosition;
    aimPosition?: AimMarkerSource;
    dashedEntryPriceLine?: boolean;
    tpPrice?: number;
    slPrice?: number;
    betterToCloseAt?: number;
    entryOrders: OpenOrder[];
    height?: number;
    trajectory?: TrajectoryPoint[][];
    trajectoryAnchor?: {
        price: number;
        time: number;
    };
    trajectoryDirection?: TrajectoryDirection;
}

export default function CurrencyChart({ data, markers, activePosition, aimPosition, dashedEntryPriceLine = false, tpPrice, slPrice, betterToCloseAt, entryOrders, height = 400, trajectory, trajectoryAnchor, trajectoryDirection }: ChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<any> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const trajectorySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
    const trajectoryMetaRef = useRef<Map<ISeriesApi<"Line">, Array<{ point: TrajectoryPoint; scenario: string; pointIndex: number; normalizedTime: number }>>>(new Map());
    const trajectoryAnchorPriceRef = useRef<number | undefined>(trajectoryAnchor?.price);
    const trajectoryDirectionRef = useRef<TrajectoryDirection>(trajectoryDirection);
    const markersPrimitiveRef = useRef<any>(null);
    const entryOrderLinesRef = useRef<any[]>([]);
    const resolvedAimPosition =
        aimPosition ?? activePosition?.strategy.entry.feature?.aimPosition;
    const [trajectoryHover, setTrajectoryHover] = useState<TrajectoryHoverState | null>(null);
    const [markerHover, setMarkerHover] = useState<MarkerHoverState | null>(null);
    const [betterCloseLineX, setBetterCloseLineX] = useState<number | null>(null);
    const markerMetaRef = useRef<Marker[]>([]);
    const previousDataWindowRef = useRef<{ firstTime: number; lastTime: number } | null>(null);
    const previousProjectedTimeRef = useRef<number | null>(null);

    useEffect(() => {
        trajectoryAnchorPriceRef.current = trajectoryAnchor?.price;
        trajectoryDirectionRef.current = trajectoryDirection;
    }, [trajectoryAnchor?.price, trajectoryDirection]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#DDD",
            },
            width: chartContainerRef.current.clientWidth,
            height,
            grid: {
                vertLines: { color: "#333" },
                horzLines: { color: "#333" },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
            },
        });

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderVisible: false,
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350"
        });

        markersPrimitiveRef.current = createSeriesMarkers(candlestickSeries, []);

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: "#26a69a",
            priceFormat: {
                type: "volume",
            },
            priceScaleId: "", // Set as an overlay
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.8, // Highest volume bar will be 80% down the chart
                bottom: 0,
            },
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;
        volumeSeriesRef.current = volumeSeries;

        const handleCrosshairMove = (param: any) => {
            const container = chartContainerRef.current;
            if (
                !container ||
                !param?.point ||
                typeof param.point.x !== "number" ||
                typeof param.point.y !== "number" ||
                param.point.x < 0 ||
                param.point.y < 0 ||
                param.point.x > container.clientWidth ||
                param.point.y > container.clientHeight
            ) {
                setTrajectoryHover(null);
                setMarkerHover(null);
                return;
            }

            for (const [series, points] of trajectoryMetaRef.current.entries()) {
                const dataAtPoint = param.seriesData?.get?.(series);
                if (!dataAtPoint) {
                    continue;
                }

                const hoveredTime =
                    typeof dataAtPoint.time === "number"
                        ? dataAtPoint.time
                        : typeof param.time === "number"
                            ? param.time
                            : null;
                const hoveredValue =
                    typeof dataAtPoint.value === "number"
                        ? dataAtPoint.value
                        : typeof dataAtPoint.close === "number"
                            ? dataAtPoint.close
                            : null;

                const matchedPoint = points.find((item) =>
                    item.normalizedTime === hoveredTime &&
                    hoveredValue !== null &&
                    Math.abs(item.point.price - hoveredValue) <= Math.max(item.point.price * 0.000001, 1e-10),
                );

                if (!matchedPoint) {
                    continue;
                }

                setTrajectoryHover({
                    x: Math.min(param.point.x + 12, Math.max(8, container.clientWidth - 320)),
                    y: Math.max(8, param.point.y - 12),
                    scenario: matchedPoint.scenario,
                    pointIndex: matchedPoint.pointIndex,
                    point: matchedPoint.point,
                    pnlPercent: computeTrajectoryPnl({
                        entryPrice: trajectoryAnchorPriceRef.current,
                        pointPrice: matchedPoint.point.price,
                        direction: trajectoryDirectionRef.current,
                    }),
                });
                setMarkerHover(null);
                return;
            }

            setTrajectoryHover(null);

            const candleSeries = seriesRef.current;
            const hoveredSeriesData = candleSeries
                ? param.seriesData?.get?.(candleSeries)
                : null;
            const hoveredTime =
                typeof hoveredSeriesData?.time === "number"
                    ? hoveredSeriesData.time
                    : typeof param.time === "number"
                        ? param.time
                        : null;

            if (!candleSeries || hoveredTime === null) {
                setMarkerHover(null);
                return;
            }

            const markerMatch = markerMetaRef.current
                .filter(
                    (marker) =>
                        marker.time === hoveredTime &&
                        typeof marker.price === "number" &&
                        Number.isFinite(marker.price) &&
                        typeof marker.tooltipText === "string" &&
                        marker.tooltipText.length > 0,
                )
                .map((marker) => {
                    const coordinate = candleSeries.priceToCoordinate(marker.price!);
                    return {
                        marker,
                        coordinate,
                        distance:
                            typeof coordinate === "number"
                                ? Math.abs(coordinate - param.point.y)
                                : Number.POSITIVE_INFINITY,
                    };
                })
                .filter((item) => Number.isFinite(item.distance))
                .sort((a, b) => a.distance - b.distance)[0];

            if (markerMatch && markerMatch.distance <= 18) {
                setMarkerHover({
                    x: Math.min(param.point.x + 12, Math.max(8, container.clientWidth - 320)),
                    y: Math.max(8, param.point.y - 12),
                    title: markerMatch.marker.tooltipTitle ?? markerMatch.marker.text,
                    text: markerMatch.marker.tooltipText ?? markerMatch.marker.text,
                });
                return;
            }

            setMarkerHover(null);
        };

        chart.subscribeCrosshairMove(handleCrosshairMove);

        const handleResize = () => {
            chart.applyOptions({
                width: chartContainerRef.current?.clientWidth || 0,
                height,
            });
        };

        window.addEventListener("resize", handleResize);

        // eslint-disable-next-line consistent-return
        return () => {
            window.removeEventListener("resize", handleResize);
            chart.unsubscribeCrosshairMove(handleCrosshairMove);
            chart.remove();
            seriesRef.current = null;
            volumeSeriesRef.current = null;
            markersPrimitiveRef.current = null;
        };
    }, [height]);

    // Update data
    useEffect(() => {
        if (seriesRef.current && volumeSeriesRef.current && data.length > 0) {
            // Sort and deduplicate data by time
            const uniqueDataMap = new Map();
            data.forEach((item) => uniqueDataMap.set(item.time, item));
            const sortedData = Array.from(uniqueDataMap.values()).sort(
                (a, b) => a.time - b.time
            );
            const firstTime = sortedData[0]?.time;
            const lastTime = sortedData[sortedData.length - 1]?.time;
            const previousDataWindow = previousDataWindowRef.current;
            const chart = chartRef.current;
            const shouldPreserveVisibleRange =
                Boolean(previousDataWindow) &&
                typeof firstTime === "number" &&
                typeof lastTime === "number" &&
                previousDataWindow?.firstTime === firstTime &&
                lastTime >= previousDataWindow.lastTime;
            const visibleLogicalRange = shouldPreserveVisibleRange
                ? chart?.timeScale().getVisibleLogicalRange() ?? null
                : null;
            const maxProjectedTime = getMaxProjectedTime({
                markers,
                trajectory,
                trajectoryAnchor,
                betterToCloseAt,
            });
            const projectedTimeChanged = previousProjectedTimeRef.current !== maxProjectedTime;
            const paddedData = padDataWithFutureWhitespace({
                data: sortedData as any,
                targetTime: maxProjectedTime,
            });

            const precision = computePricePrecision({
                data: sortedData as any,
                activePosition,
                aimPosition: resolvedAimPosition,
                trajectory,
            });
            const minMove = 1 / Math.pow(10, precision);
            seriesRef.current.applyOptions({
                priceFormat: {
                    type: "price",
                    precision,
                    minMove,
                },
            });

            seriesRef.current.setData(paddedData as any);

            const volumeData = paddedData.map((d: any) =>
                typeof d.volume === "number" && Number.isFinite(d.volume)
                    ? {
                        time: d.time,
                        value: d.volume,
                        color: d.close >= d.open ? "#26a69a" : "#ef5350",
                    }
                    : { time: d.time },
            );
            volumeSeriesRef.current.setData(volumeData as any);

            if (visibleLogicalRange && chart) {
                chart.timeScale().setVisibleLogicalRange(visibleLogicalRange);
            } else if (chart && projectedTimeChanged) {
                chart.timeScale().fitContent();
            }

            if (typeof firstTime === "number" && typeof lastTime === "number") {
                previousDataWindowRef.current = { firstTime, lastTime };
            }
            previousProjectedTimeRef.current = maxProjectedTime;

            // Update markers (lightweight-charts v5 uses a markers primitive)
            if (markersPrimitiveRef.current?.setMarkers) {
                const m = Array.isArray(markers) ? [...markers] : [];

                if (activePosition) {
                    // Add active position marker (entry)
                    m.push(...activePositionToMarkers(activePosition));
                }

                if (resolvedAimPosition) {
                    m.push(...aimPositionToMarkers(resolvedAimPosition));
                }

                m.sort((a, b) => a.time - b.time);
                markerMetaRef.current = m;
                markersPrimitiveRef.current.setMarkers(m);
            }

            // Remove existing pricelines if any (not directly supported by API to "clear", so we rely on finding unique ones or recreation)
            // A better way is to store references to pricelines, but lightweight-charts React wrappers are complex.
            // For raw usage, we might need to remove them manually if the method exists, or just keep it simple.
            // Actually, `createPriceLine` returns an object with `applyOptions` and `remove`.

            // NOTE: Since we are re-using the chart series, we should probably clear pricelines.
            // However, lightweight-charts doesn't have a clearPriceLines method on the series.
            // We would need to track them. Ideally we would rebuild chart on position change or track strictly.
            // For now, let's proceed with adding it. If multiple lines heap up, we might need a ref to existingLine.
        }
    }, [activePosition, betterToCloseAt, data, markers, resolvedAimPosition, trajectory, trajectoryAnchor]);

    useEffect(() => {
        const chart = chartRef.current;
        const container = chartContainerRef.current;
        const normalizedTime =
            typeof betterToCloseAt === "number"
                ? normalizeTrajectoryTime(betterToCloseAt)
                : null;
        let animationFrameId: number | null = null;

        if (!chart || !container || normalizedTime === null) {
            animationFrameId = window.requestAnimationFrame(() => {
                setBetterCloseLineX(null);
            });
            return () => {
                if (animationFrameId !== null) {
                    window.cancelAnimationFrame(animationFrameId);
                }
            };
        }

        const updateLinePosition = () => {
            const coordinate = chart.timeScale().timeToCoordinate(normalizedTime as any);
            setBetterCloseLineX(
                typeof coordinate === "number" &&
                    Number.isFinite(coordinate) &&
                    coordinate >= 0 &&
                    coordinate <= container.clientWidth
                    ? coordinate
                    : null,
            );
        };

        const handleResize = () => {
            window.requestAnimationFrame(updateLinePosition);
        };

        animationFrameId = window.requestAnimationFrame(updateLinePosition);
        chart.timeScale().subscribeVisibleLogicalRangeChange(updateLinePosition);
        window.addEventListener("resize", handleResize);

        return () => {
            if (animationFrameId !== null) {
                window.cancelAnimationFrame(animationFrameId);
            }
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateLinePosition);
            window.removeEventListener("resize", handleResize);
        };
    }, [betterToCloseAt, data, height, markers, trajectory, trajectoryAnchor]);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) {
            return undefined;
        }

        trajectorySeriesRef.current.forEach((series) => {
            chart.removeSeries(series);
        });
        trajectorySeriesRef.current = [];
        trajectoryMetaRef.current.clear();
        const resetHoverFrameId = window.requestAnimationFrame(() => {
            setTrajectoryHover(null);
        });

        const colors = ["#ff7043", "#42a5f5", "#66bb6a", "#ab47bc"];
        const scenarioNames = ["A", "B", "C", "D"];
        const anchorTime = trajectoryAnchor
            ? normalizeTrajectoryTime(trajectoryAnchor.time)
            : null;
        const anchor =
            anchorTime !== null &&
            typeof trajectoryAnchor?.price === "number" &&
            Number.isFinite(trajectoryAnchor.price) &&
            trajectoryAnchor.price > 0
                ? { time: anchorTime as any, value: trajectoryAnchor.price }
                : null;

        trajectory?.forEach((scenario, index) => {
            const scenarioPoints = scenario
                .map((point) => {
                    const time = normalizeTrajectoryTime(point.time);
                    if (
                        time === null ||
                        typeof point.price !== "number" ||
                        !Number.isFinite(point.price) ||
                        point.price <= 0
                    ) {
                        return null;
                    }

                    return {
                        time: time as any,
                        value: point.price,
                    };
                })
                .filter((point): point is { time: any; value: number } =>
                    Boolean(point),
                )
                .sort((a, b) => a.time - b.time);
            const points =
                anchor && (scenarioPoints[0]?.time ?? Number.POSITIVE_INFINITY) > anchor.time
                    ? [anchor, ...scenarioPoints]
                    : scenarioPoints;

            if (points.length === 0) {
                return;
            }

            const series = chart.addSeries(LineSeries, {
                color: colors[index % colors.length],
                lineWidth: 2,
                lineStyle: index === 2 ? 0 : 2,
                priceLineVisible: false,
                lastValueVisible: false,
                pointMarkersVisible: true,
                pointMarkersRadius: 4,
                crosshairMarkerVisible: true,
                title: `AIM ${String.fromCharCode(65 + index)}`,
            });

            series.setData(points);
            trajectorySeriesRef.current.push(series);
            trajectoryMetaRef.current.set(
                series,
                scenario
                    .map((point, pointIndex) => {
                        const normalizedTime = normalizeTrajectoryTime(point.time);
                        if (normalizedTime === null) {
                            return null;
                        }

                        return {
                            point,
                            pointIndex,
                            normalizedTime,
                            scenario: scenarioNames[index] ?? String.fromCharCode(65 + index),
                        };
                    })
                    .filter((item): item is { point: TrajectoryPoint; scenario: string; pointIndex: number; normalizedTime: number } => Boolean(item)),
            );
        });

        return () => {
            window.cancelAnimationFrame(resetHoverFrameId);
        };
    }, [trajectory, trajectoryAnchor]);

    // Handle Active Position Entry Line
    const entryLineRef = useRef<any>(null);
    const aimLineRef = useRef<any>(null);
    const tpLineRef = useRef<any>(null);
    const slLineRef = useRef<any>(null);

    useEffect(() => {
        if (!seriesRef.current) return;

        // Remove existing line
        if (entryLineRef.current) {
            seriesRef.current.removePriceLine(entryLineRef.current);
            entryLineRef.current = null;
        }

        // console.log("activePosition", activePosition)

        if (activePosition?.exposure.averageEntryPrice) {
            const hasAveragingExecutions =
                (activePosition.strategy.averaging.executions?.length ?? 0) > 0;

            entryLineRef.current = seriesRef.current.createPriceLine({
                price: activePosition.exposure.averageEntryPrice,
                color: '#2962FF',
                lineWidth: 2,
                // BTEST:BACKTEST_TRADE_CHART_AVERAGING
                lineStyle: dashedEntryPriceLine
                    ? LineStyle.Dashed
                    : LineStyle.Dotted,
                axisLabelVisible: true,
                title: hasAveragingExecutions ? 'Avg Entry' : 'Entry',
            });
        }

    }, [activePosition, dashedEntryPriceLine]);

    useEffect(() => {
        if (!seriesRef.current) return;

        if (aimLineRef.current) {
            seriesRef.current.removePriceLine(aimLineRef.current);
            aimLineRef.current = null;
        }

        if (resolvedAimPosition && typeof resolvedAimPosition.beginPrice === "number") {
            aimLineRef.current = seriesRef.current.createPriceLine({
                price: resolvedAimPosition.beginPrice,
                color: "#f9a825",
                lineWidth: 2,
                lineStyle: 1,
                axisLabelVisible: true,
                title: "AIM",
            });
        }
    }, [resolvedAimPosition]);

    useEffect(() => {
        if (!seriesRef.current) return;

        if (tpLineRef.current) {
            seriesRef.current.removePriceLine(tpLineRef.current);
            tpLineRef.current = null;
        }

        if (typeof tpPrice === "number" && Number.isFinite(tpPrice) && tpPrice > 0) {
            tpLineRef.current = seriesRef.current.createPriceLine({
                price: tpPrice,
                color: "#2e7d32",
                lineWidth: 2,
                lineStyle: 2,
                axisLabelVisible: true,
                title: "TP",
            });
        }
    }, [tpPrice]);

    useEffect(() => {
        if (!seriesRef.current) return;

        if (slLineRef.current) {
            seriesRef.current.removePriceLine(slLineRef.current);
            slLineRef.current = null;
        }

        if (typeof slPrice === "number" && Number.isFinite(slPrice) && slPrice > 0) {
            slLineRef.current = seriesRef.current.createPriceLine({
                price: slPrice,
                color: "#d32f2f",
                lineWidth: 2,
                lineStyle: 2,
                axisLabelVisible: true,
                title: "SL",
            });
        }
    }, [slPrice]);


    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;

        // Cleanup existing lines
        entryOrderLinesRef.current.forEach((line) => {
            series.removePriceLine(line);
        });
        entryOrderLinesRef.current = [];

        entryOrders.forEach((order) => {
            if (typeof order.targetPrice === "number" && Number.isFinite(order.targetPrice) && order.targetPrice > 0) {
                const line = series.createPriceLine({
                    price: order.targetPrice,
                    color: '#2962FF',
                    lineWidth: 2,
                    lineStyle: 1, // Dotted
                    axisLabelVisible: true,
                    title: `${(order.side ?? "ORDER").toUpperCase()} MAKER ${order.targetPrice}`,
                });
                entryOrderLinesRef.current.push(line);
            }
        });
    }, [entryOrders]);

    const betterCloseLabel =
        typeof betterToCloseAt === "number" && Number.isFinite(betterToCloseAt) && betterToCloseAt > 0
            ? new Date(betterToCloseAt).toLocaleString()
            : null;

    return (
        <div ref={chartContainerRef} style={{ position: "relative" }}>
            {betterCloseLineX !== null && betterCloseLabel ? (
                <>
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: betterCloseLineX,
                            transform: "translateX(-50%)",
                            width: 0,
                            borderLeft: "3px dashed rgba(255, 87, 34, 0.98)",
                            pointerEvents: "none",
                            zIndex: 9,
                            boxShadow: "0 0 0 1px rgba(255,255,255,0.18)",
                        }}
                        title={`Better close at ${betterCloseLabel}`}
                    />
                    <div
                        style={{
                            position: "absolute",
                            top: 10,
                            left: betterCloseLineX,
                            transform: "translateX(-50%)",
                            pointerEvents: "none",
                            zIndex: 10,
                            background: "rgba(255, 87, 34, 0.16)",
                            border: "1px solid rgba(255, 87, 34, 0.65)",
                            color: "#ff7043",
                            borderRadius: 999,
                            padding: "3px 9px",
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
                        }}
                        title={`Better close at ${betterCloseLabel}`}
                    >
                        Better close
                    </div>
                </>
            ) : null}
            {trajectoryHover ? (
                <div
                    style={{
                        position: "absolute",
                        left: trajectoryHover.x,
                        top: trajectoryHover.y,
                        zIndex: 20,
                        maxWidth: 320,
                        pointerEvents: "none",
                        background: "rgba(15, 23, 42, 0.95)",
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        color: "#e5e7eb",
                        fontSize: 12,
                        lineHeight: 1.45,
                        boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        AIM {trajectoryHover.scenario}.{trajectoryHover.pointIndex}
                    </div>
                    <div>
                        {trajectoryHover.point.timeHuman}
                    </div>
                    <div>
                        Price: {trajectoryHover.point.price}
                    </div>
                    <div>
                        Entry PnL: {trajectoryHover.pnlPercent === null
                            ? "—"
                            : `${trajectoryHover.pnlPercent > 0 ? "+" : ""}${trajectoryHover.pnlPercent.toFixed(2)}%`}
                    </div>
                    <div style={{ marginTop: 6 }}>
                        {trajectoryHover.point.message}
                    </div>
                </div>
            ) : null}
            {!trajectoryHover && markerHover ? (
                <div
                    style={{
                        position: "absolute",
                        left: markerHover.x,
                        top: markerHover.y,
                        zIndex: 20,
                        maxWidth: 320,
                        pointerEvents: "none",
                        background: "rgba(15, 23, 42, 0.95)",
                        border: "1px solid rgba(148, 163, 184, 0.35)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        color: "#e5e7eb",
                        fontSize: 12,
                        lineHeight: 1.45,
                        boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {markerHover.title}
                    </div>
                    <div>{markerHover.text}</div>
                </div>
            ) : null}
        </div>
    );
}
