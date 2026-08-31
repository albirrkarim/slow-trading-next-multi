"use client";

import TradeChartBase from "@/components/LiveDashboard/Shared/TradeChartBase";
import ButtonDialog from "@/components/ui/ButtonDialog";
import type { VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange/types";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Box, IconButton, Typography } from "@mui/material";
import moment from "moment-timezone";

function resolveMarketType(
  tradingMode: SlowTradingDashboardState["config"]["tradingMode"],
): "SPOT" | "FUTURES" {
  return tradingMode === TradingMode.FUTURES ? "FUTURES" : "SPOT";
}

export default function LatestVolatilityPointChartDialog({
  dashboardState,
  point,
  symbol,
}: {
  dashboardState: SlowTradingDashboardState;
  point: VolatilityPoint;
  symbol: string;
}) {
  const exchangeType = dashboardState.config.exchangeType;
  const marketType = resolveMarketType(dashboardState.config.tradingMode);

  return (
    <ButtonDialog
      title="View Chart"
      titleLong={`${symbol} — Volatility Chart`}
      maxWidth="xl"
      size="small"
      variant="outlined"
      customButton={(handleOpen) => (
        <IconButton
          size="small"
          color="primary"
          sx={{ fontSize: "0.7rem", textTransform: "none" }}
          onClick={handleOpen}
          title={`View chart for ${symbol}`}
        >
          <ShowChartIcon fontSize="small" />
        </IconButton>
      )}
    >
      {() => (
        <Box sx={{ p: 1, backgroundColor: "background.default" }}>
          <TradeChartBase
            symbol={symbol}
            exchange={exchangeType}
            marketType={marketType}
            markers={[]}
            volatilitySource="storage"
            includeTradeHistory
            defaultShowVolatility
            header={
              <>
                <Typography variant="body2">
                  <strong>Latest V Point:</strong>{" "}
                  {moment(point.t).format("DD MMM YYYY HH:mm")} | Level:{" "}
                  {point.lvl} {point.l}
                </Typography>
                <Typography variant="body2">
                  <strong>Price:</strong> {point.p}
                </Typography>
              </>
            }
          />
        </Box>
      )}
    </ButtonDialog>
  );
}
