"use client";

import type { VolatilityPoint } from "@/lib/dynamic";
import vPointPctDistribution from "@/lib/dynamic/utils/vpoint-pct-distribution";
import type { VPointPctDistributionOccurrence } from "@/lib/dynamic/utils/vpoint-pct-distribution";
import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

function formatOccurrenceDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

function formatExactPct(pct: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(pct)}%`;
}

function formatOccurrenceDetail(
  occurrence: VPointPctDistributionOccurrence,
): string {
  return [
    occurrence.t !== undefined
      ? formatOccurrenceDate(occurrence.t)
      : undefined,
    occurrence.id,
    `L${occurrence.lvl}`,
    formatExactPct(occurrence.pct),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Reusable vPoint percentage range distribution. */
export default function VPointPctDistribution({
  points,
  rangeLabel,
}: {
  points: VolatilityPoint[];
  rangeLabel: string;
}) {
  const [intervalInput, setIntervalInput] = useState(
    String(vPointPctDistribution.interval.defaultValue),
  );
  const interval = vPointPctDistribution.interval.normalize(
    Number(intervalInput),
  );
  const buckets = useMemo(
    () => vPointPctDistribution.compute(points, interval),
    [interval, points],
  );
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (points.length === 0) return null;

  return (
    <Box sx={{ minWidth: 0, mt: 1, whiteSpace: "normal" }}>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          gap: 1,
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="body2">
            {total.toLocaleString()} finite vPoints · {rangeLabel} range
          </Typography>
          <Typography color="text.secondary" variant="caption">
            Only percentage ranges containing at least one vPoint are listed.
          </Typography>
        </Box>
        <TextField
          label="Interval %"
          onBlur={() => setIntervalInput(String(interval))}
          onChange={(event) => setIntervalInput(event.target.value)}
          size="small"
          slotProps={{
            htmlInput: {
              inputMode: "decimal",
              min: vPointPctDistribution.interval.minimum,
              step: "0.1",
            },
          }}
          sx={{ flex: "0 0 100px" }}
          type="number"
          value={intervalInput}
        />
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 480 }} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>vPoint pct range</TableCell>
              <TableCell align="right">Count</TableCell>
              <TableCell sx={{ minWidth: 140 }}>Share</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {buckets.map((bucket) => {
              const share = total > 0 ? (bucket.count / total) * 100 : 0;
              return (
                <TableRow key={bucket.label}>
                  <TableCell>
                    {bucket.label}
                    {bucket.occurrences?.map((occurrence, index) => (
                      <Typography
                        color="text.secondary"
                        display="block"
                        key={`${occurrence.id ?? "vpoint"}-${occurrence.t ?? index}`}
                        sx={{ overflowWrap: "anywhere" }}
                        variant="caption"
                      >
                        {formatOccurrenceDetail(occurrence)}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell align="right">
                    {bucket.count.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
                      <LinearProgress
                        aria-label={`${bucket.label}: ${share.toFixed(1)}%`}
                        sx={{ flex: 1, minWidth: 56 }}
                        value={share}
                        variant="determinate"
                      />
                      <Typography
                        color="text.secondary"
                        sx={{ minWidth: 42, textAlign: "right" }}
                        variant="caption"
                      >
                        {share.toFixed(1)}%
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {buckets.length === 0 && (
              <TableRow>
                <TableCell align="center" colSpan={3}>
                  No finite vPoint percentages are available.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
