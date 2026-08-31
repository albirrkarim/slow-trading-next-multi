"use client";

import { endpoints } from "@/components/endpoints";
import { convertVolatilityToMarkers } from "@/components/LiveDashboard/converter";
import CurrencyChart from "@/components/LiveDashboard/Shared/CurrencyChart";
import ButtonDialog from "@/components/ui/ButtonDialog";
import type {
  CoinFinderChartData,
  CoinFinderRange,
} from "@/lib/devBacktest/coins/types";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Alert, Box, CircularProgress, IconButton, Typography } from "@mui/material";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";

function CoinChart({ range, symbol }: { range: CoinFinderRange; symbol: string }) {
  const [data, setData] = useState<CoinFinderChartData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void axios
      .get<CoinFinderChartData>(endpoints.dev.coins, {
        params: { action: "chart", range, symbol },
        signal: controller.signal,
      })
      .then((response) => setData(response.data))
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) {
          setError(
            requestError?.response?.data?.error ?? "Failed to load coin chart",
          );
        }
      });

    return () => controller.abort();
  }, [range, symbol]);

  const candles = useMemo(
    () =>
      (data?.klines ?? []).map((kline) => ({
        close: Number(kline[4]),
        high: Number(kline[2]),
        low: Number(kline[3]),
        open: Number(kline[1]),
        time: Number(kline[0]) / 1000,
        volume: Number(kline[5]),
      })),
    [data],
  );
  const markers = useMemo(
    () => convertVolatilityToMarkers(data?.points ?? []),
    [data],
  );

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {data.klines.length.toLocaleString()} five-minute candles ·{" "}
        {data.points.length.toLocaleString()} cached volatility points
      </Typography>
      <CurrencyChart
        activePosition={undefined}
        data={candles}
        entryOrders={[]}
        height={600}
        markers={markers}
      />
    </Box>
  );
}

export default function CoinChartDialog({
  range,
  symbol,
}: {
  range: CoinFinderRange;
  symbol: string;
}) {
  return (
    <ButtonDialog
      title="Chart"
      titleLong={`${symbol} — ${range} volatility chart`}
      maxWidth="xl"
      customButton={(handleOpen) => (
        <IconButton
          color="primary"
          onClick={handleOpen}
          size="small"
          title={`View ${symbol} chart`}
        >
          <ShowChartIcon fontSize="small" />
        </IconButton>
      )}
    >
      {() => <CoinChart range={range} symbol={symbol} />}
    </ButtonDialog>
  );
}
