"use client";

import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from "@mui/material";
import {
  CandlestickSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlackSwanSavingsKline } from "@/lib/devBacktest/black-swan";

type ChartInterval = "1m" | "5m";

export interface BlackSwanKlineMarker {
  color: string;
  position: "aboveBar" | "belowBar";
  shape: "arrowDown" | "arrowUp" | "circle" | "square";
  t: number;
  text: string;
}

/** Resolves an event to the newest displayed candle at or before its time. */
function markerTime(
  candles: BlackSwanSavingsKline[],
  eventT: number,
): UTCTimestamp | null {
  let candidate: number | null = null;
  for (const candle of candles) {
    if (candle[0] > eventT) break;
    candidate = candle[0];
  }
  return candidate === null
    ? null
    : (Math.floor(candidate / 1000) as UTCTimestamp);
}

/** Aggregates raw one-minute OHLC candles without changing vPoint data. */
function aggregateCandles(
  candles: BlackSwanSavingsKline[],
  interval: ChartInterval,
): BlackSwanSavingsKline[] {
  if (interval === "1m") return candles;
  const bucketMs = 5 * 60_000;
  const result: BlackSwanSavingsKline[] = [];

  for (const candle of candles) {
    const bucketT = Math.floor(candle[0] / bucketMs) * bucketMs;
    const current = result.at(-1);
    if (!current || current[0] !== bucketT) {
      result.push([bucketT, candle[1], candle[2], candle[3], candle[4]]);
      continue;
    }
    current[2] = Math.max(current[2], candle[2]);
    current[3] = Math.min(current[3], candle[3]);
    current[4] = candle[4];
  }

  return result;
}

export default function BlackSwanKlineChart({
  averageEntryPrice,
  candles,
  label,
  markers,
}: {
  averageEntryPrice?: number;
  candles: BlackSwanSavingsKline[];
  label: string;
  markers: BlackSwanKlineMarker[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const visibleCandles = useMemo(
    () => aggregateCandles(candles, interval),
    [candles, interval],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visibleCandles.length === 0) return () => undefined;

    const chart = createChart(container, {
      height: 240,
      layout: {
        attributionLogo: false,
        background: { color: theme.palette.background.paper },
        textColor: theme.palette.text.secondary,
      },
      grid: {
        horzLines: { color: theme.palette.divider },
        vertLines: { color: theme.palette.divider },
      },
      rightPriceScale: { borderColor: theme.palette.divider },
      timeScale: {
        borderColor: theme.palette.divider,
        secondsVisible: false,
        timeVisible: true,
      },
      width: Math.max(1, container.clientWidth),
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderDownColor: theme.palette.error.main,
      borderUpColor: theme.palette.success.main,
      downColor: theme.palette.error.main,
      upColor: theme.palette.success.main,
      wickDownColor: theme.palette.error.main,
      wickUpColor: theme.palette.success.main,
    });
    candleSeries.setData(
      visibleCandles.map((candle) => ({
        close: candle[4],
        high: candle[2],
        low: candle[3],
        open: candle[1],
        time: Math.floor(candle[0] / 1000) as UTCTimestamp,
      })),
    );

    const visibleMarkers = markers.flatMap((marker) => {
      const time = markerTime(visibleCandles, marker.t);
      return time === null ? [] : [{ ...marker, time }];
    });
    createSeriesMarkers(
      candleSeries,
      visibleMarkers
        .sort((left, right) => Number(left.time) - Number(right.time))
        .map(({ t: _t, ...marker }) => marker),
    );

    if (
      typeof averageEntryPrice === "number" &&
      Number.isFinite(averageEntryPrice) &&
      averageEntryPrice > 0
    ) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: theme.palette.info.main,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        price: averageEntryPrice,
        title: "Avg entry",
      });
    }

    chart.timeScale().fitContent();
    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.max(1, entry.contentRect.width) });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [averageEntryPrice, markers, theme, visibleCandles]);

  return (
    <Box sx={{ minWidth: 0, width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
        <ToggleButtonGroup
          aria-label="Chart candle interval"
          exclusive
          onChange={(_event, value: ChartInterval | null) => {
            if (value) setInterval(value);
          }}
          size="small"
          value={interval}
        >
          <ToggleButton
            aria-label="Show one-minute candles"
            sx={{ minHeight: 44, minWidth: 48, px: 1 }}
            value="1m"
          >
            1m
          </ToggleButton>
          <ToggleButton
            aria-label="Show five-minute candles"
            sx={{ minHeight: 44, minWidth: 48, px: 1 }}
            value="5m"
          >
            5m
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box
        aria-label={`${label}, ${interval} candles`}
        ref={containerRef}
        role="img"
        sx={{ height: 240, minWidth: 0, width: "100%" }}
      />
    </Box>
  );
}
