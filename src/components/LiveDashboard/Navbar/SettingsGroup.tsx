"use client";

import type { ReactNode } from "react";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { Box, Stack, Typography } from "@mui/material";

import IconButtonTooltip from "@/components/ui/IconButtonTooltip";

export default function SettingsGroup({
  children,
  description,
  info,
  title,
}: {
  children: ReactNode;
  description?: string;
  info?: string;
  title: ReactNode;
}) {
  return (
    <Box>
      {typeof title === "string" && (
        <Stack
          alignItems="center"
          direction="row"
          gap={0.5}
          sx={{ mb: 0.5 }}
        >
          <Typography fontWeight={700} variant="subtitle1">
            {title}
          </Typography>
          {info && (
            <IconButtonTooltip
              size="small"
              sx={{ color: "text.secondary", p: 0.25 }}
              tooltipTitle={info}
            >
              <HelpOutlineIcon fontSize="inherit" />
            </IconButtonTooltip>
          )}
        </Stack>
      )}
      {typeof title !== "string" && <Box sx={{ mb: 0.5 }}>{title}</Box>}
      {description && (
        <Typography
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
          variant="caption"
        >
          {description}
        </Typography>
      )}
      <Stack gap={1.25}>{children}</Stack>
    </Box>
  );
}
