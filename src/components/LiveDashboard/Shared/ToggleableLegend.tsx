"use client";

import { Box } from "@mui/material";

type LegendPayloadItem = {
  dataKey?: string;
  value?: string;
  color?: string;
};

export function ToggleableLegend({
  payload,
  hidden,
  onToggle,
}: {
  payload?: LegendPayloadItem[];
  hidden: Record<string, boolean>;
  onToggle: (dataKey: string) => void;
}) {
  if (!payload || payload.length === 0) return null;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, fontSize: 12 }}>
      {payload.map((item) => {
        const dataKey = item.dataKey;
        if (!dataKey) return null;

        const isHidden = hidden[dataKey] ?? false;

        return (
          <Box
            key={dataKey}
            onClick={() => onToggle(dataKey)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
              userSelect: "none",
              opacity: isHidden ? 0.4 : 1,
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                bgcolor: item.color ?? "text.primary",
              }}
            />
            <Box component="span">{item.value ?? dataKey}</Box>
          </Box>
        );
      })}
    </Box>
  );
}
