"use client";

import { Chip, Tooltip, Typography, type ChipProps } from "@mui/material";

/** Selects readable black or white text for a six-digit hexadecimal color. */
function tagTextColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? "#111827" : "#ffffff";
}

export default function CoinTagChip({
  description = "",
  tagColor = "#1976d2",
  ...props
}: Omit<ChipProps, "color"> & { description?: string; tagColor?: string }) {
  const tooltipDescription = description.trim();
  const chip = (
    <Chip
      {...props}
      sx={{
        backgroundColor: tagColor,
        color: tagTextColor(tagColor),
        "& .MuiChip-deleteIcon": {
          color: "inherit",
          opacity: 0.75,
        },
        ...props.sx,
      }}
    />
  );

  return tooltipDescription ? (
    <Tooltip
      arrow
      title={
        <Typography
          component="span"
          variant="body1"
          sx={{ whiteSpace: "pre-line" }}
        >
          {tooltipDescription}
        </Typography>
      }
    >
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
