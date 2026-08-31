"use client";

import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";
import { Box, CircularProgress, Typography } from "@mui/material";
import dynamic from "next/dynamic";

const CoinCorrelationGraph3D =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./CoinCorrelationGraph3D"), {
        loading: () => (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ),
        ssr: false,
      })
    : undefined;

export default function CoinCorrelationChart({
  results,
}: {
  results: CoinFinderResult[];
}) {
  const hasPairs = results.some(
    (result) => Object.keys(result.correlations ?? {}).length > 0,
  );
  if (!hasPairs || !CoinCorrelationGraph3D) return null;

  return (
    <Box sx={{ mt: 1, mb: 3 }}>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
        Rotate by dragging, pan with right-drag, and zoom with the wheel. Closer
        nodes are more correlated; hover nodes or links for exact scores.
      </Typography>
      <CoinCorrelationGraph3D results={results} />
    </Box>
  );
}
