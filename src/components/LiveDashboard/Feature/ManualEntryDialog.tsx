import ButtonDialog from "@/components/ui/ButtonDialog";
import type { VolatilityPoint } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange/types";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import TradingLivePreview from "./TradingLivePreview";

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function ManualEntryDialog({
  dashboardState,
  disabled,
  point,
  submitting,
  symbol,
  onConfirm,
}: {
  dashboardState: SlowTradingDashboardState;
  disabled: boolean;
  point: VolatilityPoint;
  submitting: boolean;
  symbol: string;
  onConfirm: () => Promise<void>;
}) {
  const isLive = dashboardState.activeMode === "live";
  const direction =
    dashboardState.config.tradingMode === TradingMode.FUTURES &&
    point.l === "T"
      ? "SHORT"
      : "LONG";
  const orderType =
    dashboardState.config.modelConfig.orderType ?? "taker";

  return (
    <ButtonDialog
      title="Entry"
      titleLong={`Confirm ${symbol} manual entry`}
      maxWidth="md"
      customButton={(handleOpen) => (
        <Button
          variant="outlined"
          size="small"
          disabled={disabled || submitting}
          onClick={handleOpen}
          title={
            disabled
              ? `Cannot enter ${symbol}: an open position already exists`
              : `Review manual entry for ${symbol}`
          }
        >
          {submitting ? "Entering..." : "Entry"}
        </Button>
      )}
    >
      {(handleClose) => (
        <Stack spacing={2} sx={{ p: 1 }}>
          <Alert severity={isLive ? "warning" : "info"}>
            {isLive
              ? "LIVE mode: confirming this dialog may submit a real exchange order."
              : "SANDBOX mode: confirming this dialog executes a simulated entry."}
          </Alert>

          <Typography variant="body2">
            Manual entry uses the latest volatility point and overrides the
            normal classifier recommendation. The server still rejects an
            already-used point, an existing position, or an unsafe balance.
          </Typography>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <PreviewValue label="Symbol" value={`${symbol}_USDT`} />
            <PreviewValue label="Direction" value={direction} />
            <PreviewValue label="Signal price" value={`$${point.p.toFixed(6)}`} />
            <PreviewValue label="Order" value={orderType.toUpperCase()} />
            <PreviewValue
              label="Available / spendable"
              value={`$${dashboardState.balances.availableQuoteAsset.toFixed(2)} / $${dashboardState.balances.spendableQuoteAsset.toFixed(2)}`}
            />
          </Box>

          <Divider />

          <TradingLivePreview
            config={dashboardState.config}
            dashboardState={dashboardState}
          />

          <Typography variant="caption" color="text.secondary">
            Estimates use the current dashboard snapshot. Final price, quantity,
            fees, margin, reserve checks, and exchange precision are recalculated
            immediately before execution.
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color={isLive ? "error" : "primary"}
              disabled={submitting}
              onClick={async () => {
                await onConfirm();
                handleClose();
              }}
              startIcon={submitting ? <CircularProgress size={16} /> : undefined}
            >
              {submitting
                ? "Entering..."
                : isLive
                  ? `Enter ${symbol} live`
                  : `Enter ${symbol} in sandbox`}
            </Button>
          </Box>
        </Stack>
      )}
    </ButtonDialog>
  );
}
