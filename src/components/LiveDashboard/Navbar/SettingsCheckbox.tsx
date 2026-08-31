"use client";

import type { ReactNode } from "react";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Checkbox,
  Stack,
  Typography,
  type TypographyProps,
} from "@mui/material";

import IconButtonTooltip from "@/components/ui/IconButtonTooltip";

interface SettingsCheckboxProps {
  action?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  info: string;
  label: string;
  labelFontWeight?: number;
  labelVariant?: TypographyProps["variant"];
  onChange: (checked: boolean) => void;
}

export default function SettingsCheckbox({
  action,
  checked,
  disabled = false,
  info,
  label,
  labelFontWeight = 400,
  labelVariant = "body2",
  onChange,
}: SettingsCheckboxProps) {
  return (
    <Stack
      alignItems="center"
      direction="row"
      flexWrap={action ? "wrap" : "nowrap"}
      gap={0.5}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        inputProps={{ "aria-label": label }}
        onChange={(_, nextChecked) => onChange(nextChecked)}
        size="small"
      />
      <Typography
        color={disabled ? "text.disabled" : undefined}
        fontWeight={labelFontWeight}
        sx={{ minWidth: 0 }}
        variant={labelVariant}
      >
        {label}
      </Typography>
      <IconButtonTooltip
        size="small"
        sx={{ color: "text.secondary", p: 0.25 }}
        tooltipTitle={info}
      >
        <HelpOutlineIcon fontSize="inherit" />
      </IconButtonTooltip>
      {action}
    </Stack>
  );
}
