import { Button, Tooltip, type ButtonProps, type TooltipProps } from "@mui/material";

export interface ButtonTooltipProps extends ButtonProps {
  tooltipTitle?: TooltipProps["title"];
}

export default function ButtonTooltip({ tooltipTitle, ...buttonProps }: ButtonTooltipProps) {
  if (!tooltipTitle) {
    return <Button component="div" size="small" color="inherit" {...buttonProps} />;
  }

  return (
    <Tooltip title={tooltipTitle} arrow placement="bottom-start">
      <span> {/* Wrap with span to ensure Tooltip works even if button is disabled */}
        <Button component="div" size="small" color="inherit" {...buttonProps} />
      </span>
    </Tooltip>
  );
}
