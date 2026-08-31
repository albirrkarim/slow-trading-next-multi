"use client";

import type { MultiLinePair } from "@/components/api/dynamic";
import { endpoints } from "@/components/endpoints";
import type { Marker } from "@/components/LiveDashboard/converter";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { IntervalKlines } from "@/lib/exchange";
import axios from "axios";
import {
  Box,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CurrencyChart from "./CurrencyChart";
import { tradeLog } from "@/lib/trading/helper/log";
import type { Position } from "@/lib/trading/models";

type TrajectoryPoint = {
  price: number;
  scenario?: string;
  time: number;
};

type TradeChartPosition = Pick<
  Position<any>,
  "exposure" | "opened" | "strategy"
>;

type SlowKlinesResponse = {
  klines: any[];
  markers?: Marker[];
  priceSeries?: MultiLinePair;
  vPointsSeries?: MultiLinePair;
};

type TradeChartVolatilitySource = "generated" | "storage";

const TRADE_CHART_INTERVAL_OPTIONS: IntervalKlines[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1w",
];

function getRangeForInterval(interval: IntervalKlines): string {
  switch (interval) {
    case "1m":
      return "1month";
    case "5m":
      return "2month";
    case "15m":
      return "3month";
    case "1h":
      return "6month";
    case "4h":
      return "1year";
    case "1w":
      return "3year";
    default:
      return "6month";
  }
}

export default function TradeChartBase({
  activePosition,
  symbol,
  exchange,
  marketType,
  markers,
  header,
  trajectory,
  trajectoryAnchor,
  trajectoryDirection,
  defaultInterval = "5m",
  defaultShowVolatility = false,
  dashedEntryPriceLine = false,
  includeTradeHistory = false,
  startTimeMs,
  endTimeMs,
  volatilitySource = "storage",
}: {
  activePosition?: TradeChartPosition;
  symbol: string;
  exchange: string;
  marketType?: "SPOT" | "FUTURES";
  markers: Marker[];
  header?: ReactNode;
  trajectory?: TrajectoryPoint[][];
  trajectoryAnchor?: {
    price: number;
    time: number;
  };
  trajectoryDirection?: "LONG" | "SHORT";
  defaultInterval?: IntervalKlines;
  defaultShowVolatility?: boolean;
  dashedEntryPriceLine?: boolean;
  includeTradeHistory?: boolean;
  startTimeMs?: number;
  endTimeMs?: number;
  volatilitySource?: TradeChartVolatilitySource;
}) {
  const [klines, setKlines] = useState<any[]>([]);
  const [apiMarkers, setApiMarkers] = useState<Marker[]>([]);
  const [vPointsSeries, setVPointsSeries] = useState<MultiLinePair | undefined>(
    undefined,
  );
  const [priceSeries, setPriceSeries] = useState<MultiLinePair | undefined>(
    undefined,
  );
  const [interval, setInterval] = useState<IntervalKlines>(defaultInterval);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInterval(defaultInterval);
  }, [defaultInterval, exchange, symbol]);

  const fetchKlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<SlowKlinesResponse>(
        endpoints.slow.dev.klines,
        {
          params: {
            symbol,
            interval,
            exchange: exchange || "okx",
            marketType: marketType || "FUTURES",
            ...(typeof startTimeMs === "number" &&
              Number.isFinite(startTimeMs) &&
              typeof endTimeMs === "number" &&
              Number.isFinite(endTimeMs) &&
              endTimeMs > startTimeMs
              ? {
                startTime: Math.round(startTimeMs),
                endTime: Math.round(endTimeMs),
              }
              : {
                range: getRangeForInterval(interval),
              }),
            upToDateKlines: true,
            volatility: true,
            volatilitySource,
            tradeHistory: includeTradeHistory,
          },
        },
      );

      const rawData = res.data.klines;
      if (Array.isArray(rawData)) {
        const formattedData = rawData.map((k: any[]) => ({
          time: k[0] / 1000,
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
        }));
        setKlines(formattedData);
      }

      const nextMarkers = (res.data?.markers ?? []) as Marker[];
      setApiMarkers(Array.isArray(nextMarkers) ? nextMarkers : []);

      if (res.data.vPointsSeries?.series?.length) {
        setVPointsSeries(res.data.vPointsSeries);
      } else {
        setVPointsSeries(undefined);
      }

      if (res.data.priceSeries?.series?.length) {
        setPriceSeries(res.data.priceSeries);
      } else {
        setPriceSeries(undefined);
      }
    } catch (err) {
      tradeLog.error("Failed to fetch klines for trade chart", err);
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [
    endTimeMs,
    exchange,
    includeTradeHistory,
    interval,
    marketType,
    startTimeMs,
    symbol,
    volatilitySource,
  ]);

  useEffect(() => {
    fetchKlines();
  }, [fetchKlines]);

  const allMarkers = useMemo(() => [...apiMarkers, ...(markers ?? [])], [apiMarkers, markers]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {header ? (
        <Box
          sx={{
            mb: 1,
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {header}
        </Box>
      ) : null}

      <Box
        sx={{
          mb: 1.5,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Select
          value={interval}
          onChange={(event) => setInterval(event.target.value as IntervalKlines)}
          size="small"
          variant="outlined"
          sx={{ minWidth: 96, height: 34, fontSize: "0.875rem" }}
          title="Change trade chart interval"
        >
          {TRADE_CHART_INTERVAL_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <CurrencyChart
        data={klines}
        markers={allMarkers}
        activePosition={activePosition}
        dashedEntryPriceLine={dashedEntryPriceLine}
        entryOrders={[]}
        height={500}
        trajectory={trajectory}
        trajectoryAnchor={trajectoryAnchor}
        trajectoryDirection={trajectoryDirection}
      />

      {vPointsSeries && (
        <HeaderMetrics
          defaultExpanded={defaultShowVolatility}
          title={
            <Typography sx={{ mx: 1 }} variant="h6" gutterBottom>
              Volatility Points ({vPointsSeries.series[0]?.length ?? 0})
            </Typography>
          }
          sx={{ my: 2 }}
        >
          {(expanded) => (
            <>
              {expanded && (
                <MultiLineTimelined
                  series={vPointsSeries.series}
                  names={vPointsSeries.names}
                />
              )}
            </>
          )}
        </HeaderMetrics>
      )}

      {priceSeries && (
        <HeaderMetrics
          title={
            <Typography sx={{ mx: 1 }} variant="h6" gutterBottom>
              Price Normalized
            </Typography>
          }
          sx={{ my: 2 }}
        >
          {(expanded) => (
            <>
              {expanded && (
                <MultiLineTimelined
                  series={priceSeries.series}
                  names={priceSeries.names}
                />
              )}
            </>
          )}
        </HeaderMetrics>
      )}
    </Box>
  );
}
