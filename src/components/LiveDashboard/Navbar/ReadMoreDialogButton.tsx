"use client";

import type { ReactNode } from "react";

import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { IconButton, Tooltip } from "@mui/material";

import ButtonDialog from "@/components/ui/ButtonDialog";

interface ReadMoreDialogButtonProps {
  children: ReactNode;
  dialogTitle: string;
  tooltip: string;
}

export default function ReadMoreDialogButton({
  children,
  dialogTitle,
  tooltip,
}: ReadMoreDialogButtonProps) {
  return (
    <ButtonDialog
      customButton={(handleOpen) => (
        <Tooltip arrow title={tooltip}>
          <IconButton
            aria-label={tooltip}
            onClick={handleOpen}
            size="small"
            sx={{ flex: "0 0 auto", p: 0.25 }}
          >
            <MenuBookOutlinedIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      )}
      maxWidth="md"
      title={tooltip}
      titleLong={dialogTitle}
    >
      {() => children}
    </ButtonDialog>
  );
}
