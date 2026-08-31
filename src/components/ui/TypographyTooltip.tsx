import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  IconButton,
  Tooltip,
  Typography,
  type TypographyProps,
} from "@mui/material";
import type React from "react";

export interface TypographyTooltipProps extends TypographyProps {
  tooltipMaxWidth?: number;
  tooltipTitle?: string | React.ReactNode;
}

export default function TypographyTooltip({
  tooltipMaxWidth,
  tooltipTitle,
  children,
  variant = "body1",
  sx = {},
  ...typographyProps
}: TypographyTooltipProps) {
  return (
    <Typography
      variant={variant}
      sx={{
        fontWeight: "bold",
        mb: 1,
        ...sx,
      }}
      {...typographyProps}
    >
      {children}{" "}
      {tooltipTitle && (
        <Tooltip
          arrow
          placement="bottom-start"
          slotProps={{
            tooltip: {
              sx: {
                maxWidth: tooltipMaxWidth,
              },
            },
          }}
          title={tooltipTitle}
        >
          <span>
            <IconButton aria-label="help" size="small">
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Typography>
  );
}
