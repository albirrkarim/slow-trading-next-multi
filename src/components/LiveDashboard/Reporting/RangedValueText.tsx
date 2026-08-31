"use client";

import {
  Chip,
  Typography,
  type ChipProps,
  type TypographyProps,
} from "@mui/material";

export interface RangedValueColorRange {
  color: TypographyProps["color"];
  max?: number;
  maxInclusive?: boolean;
  min?: number;
  minInclusive?: boolean;
}

export function pickRangedValueColor({
  fallbackColor = "text.secondary",
  ranges,
  value,
}: {
  fallbackColor?: TypographyProps["color"];
  ranges: RangedValueColorRange[];
  value: number | null | undefined;
}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallbackColor;
  }

  return (
    ranges.find((range) => {
      const aboveMin =
        typeof range.min !== "number"
          ? true
          : range.minInclusive === false
            ? value > range.min
            : value >= range.min;
      const belowMax =
        typeof range.max !== "number"
          ? true
          : range.maxInclusive
            ? value <= range.max
            : value < range.max;

      return aboveMin && belowMax;
    })?.color ?? fallbackColor
  );
}

export default function RangedValueText({
  fallbackColor = "text.secondary",
  formatValue,
  ranges,
  value,
  ...typographyProps
}: Omit<TypographyProps, "children" | "color"> & {
  fallbackColor?: TypographyProps["color"];
  formatValue: (value: number | null | undefined) => string;
  ranges: RangedValueColorRange[];
  value: number | null | undefined;
}) {
  return (
    <Typography
      {...typographyProps}
      color={pickRangedValueColor({ fallbackColor, ranges, value })}
    >
      {formatValue(value)}
    </Typography>
  );
}

export function RangedValueChip({
  fallbackColor = "text.secondary",
  formatValue,
  label,
  ranges,
  value,
  variant = "outlined",
  sx,
  ...chipProps
}: Omit<ChipProps, "color" | "label"> & {
  fallbackColor?: TypographyProps["color"];
  formatValue: (value: number | null | undefined) => string;
  label: string;
  ranges: RangedValueColorRange[];
  value: number | null | undefined;
}) {
  const rangedColor = pickRangedValueColor({ fallbackColor, ranges, value });

  return (
    <Chip
      {...chipProps}
      label={`${label}: ${formatValue(value)}`}
      variant={variant}
      sx={[
        {
          borderColor: rangedColor,
          color: rangedColor,
          fontWeight: 600,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
