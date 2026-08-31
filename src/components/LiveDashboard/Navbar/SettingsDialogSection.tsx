"use client";

import type { ReactNode } from "react";

import { Box, Typography } from "@mui/material";

interface SettingsDialogSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function SettingsDialogSection({
  title,
  description,
  children,
}: SettingsDialogSectionProps) {
  return (
    <Box
      sx={(theme) => ({
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        p: 2,
        backgroundColor: theme.palette.background.paper,
        mb: 2,
      })}
    >
      <Typography
        variant="body1"
        sx={{ fontWeight: "bold", mb: 0.5 }}
        color="info"
      >
        {title}
      </Typography>

      {description ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 2 }}
        >
          {description}
        </Typography>
      ) : null}

      {children}
    </Box>
  );
}
