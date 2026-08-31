"use client";

import { Box, Slider, Typography } from "@mui/material";
import { useState } from "react";

export default function CoinThresholdSlider({
  maximumLevel,
  onCommit,
  value,
}: {
  maximumLevel: number;
  onCommit: (value: [number, number]) => void;
  value: [number, number];
}) {
  const [draft, setDraft] = useState<[number, number]>(value);

  return (
    <Box sx={{ px: { xs: 0.5, md: 2 }, pt: 0.75, pb: 0.5 }}>
      <Typography variant="caption" sx={{ display: "block", mb: 0.25 }}>
        Entry level range: |level| {draft[0]}–{draft[1]}
      </Typography>
      <Slider
        disableSwap
        marks
        max={maximumLevel}
        min={1}
        onChange={(_event, nextValue) =>
          setDraft(nextValue as [number, number])
        }
        onChangeCommitted={(_event, nextValue) => {
          const committed = nextValue as [number, number];
          setDraft(committed);
          onCommit(committed);
        }}
        step={1}
        size="small"
        sx={{ py: 0.75 }}
        value={draft}
      />
    </Box>
  );
}
