"use client";

import HeaderMetrics from "@/components/ui/HeaderMetrics";
import {
  type SlowTradingDashboardState
} from "@/lib/slowTrading/client";
import { Box, Paper, Typography } from "@mui/material";
import { useMemo } from "react";
import { calculateSlowWorkerCapacity } from "./worker-capacity";

function formatUsdt(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

export default function WorkerEntrySequenceMetrics({
  dashboardState,
}: {
  dashboardState: SlowTradingDashboardState;
}) {
  return (
    <HeaderMetrics
      headerCanBeClicked
      title={
        <Typography fontWeight="bold" variant="body1">
          Worker Capacity
        </Typography>
      }
    >
      {(expanded) => (
        <>
          {expanded && (
            <WorkerEntrySequenceMetricsContent
              dashboardState={dashboardState}
            />
          )}
        </>
      )}
    </HeaderMetrics>
  );
}

function WorkerEntrySequenceMetricsContent({
  dashboardState,
}: {
  dashboardState: SlowTradingDashboardState;
}) {
  const capacity = useMemo(
    () => calculateSlowWorkerCapacity(dashboardState),
    [dashboardState],
  );

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Typography fontWeight={700} variant="h6">
          Available workers: {capacity.availableWorkers}
        </Typography>
        <Typography color="text.secondary" display="block" variant="caption">
          Spendable {formatUsdt(capacity.spendableUsdt)} · Worker{" "}
          {formatUsdt(capacity.workerCostUsdt)}
        </Typography>
        {capacity.bailoutBufferUsdt > 0 && (
          <Typography color="text.secondary" display="block" variant="caption">
            Bailout buffer preserved: {formatUsdt(capacity.bailoutBufferUsdt)}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
