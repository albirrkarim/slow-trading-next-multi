import { IconButton, Tooltip, type IconButtonProps, type TooltipProps } from "@mui/material";

export interface IconButtonTooltipProps extends IconButtonProps {
  tooltipTitle?: TooltipProps["title"];
}

export default function IconButtonTooltip({ tooltipTitle, ...iconButtonProps }: IconButtonTooltipProps) {
  if (!tooltipTitle) {
    return <IconButton component="div" {...iconButtonProps} />;
  }

  return (
    <Tooltip title={tooltipTitle} arrow placement="bottom-start">
      <span> {/* Ensures Tooltip works if IconButton is disabled */}
        <IconButton component="div" aria-label={tooltipTitle} {...iconButtonProps} />
      </span>
    </Tooltip>
  );
}
