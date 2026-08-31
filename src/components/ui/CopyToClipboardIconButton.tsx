"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { IconButtonProps } from "@mui/material";
import IconButtonTooltip from "./IconButtonTooltip";

export interface CopyToClipboardIconButtonProps extends Omit<IconButtonProps, "onClick"> {
  text: string;
  tooltipTitle?: string;
  onCopied?: () => void;
}

export default function CopyToClipboardIconButton({
  text,
  tooltipTitle = "Copy",
  onCopied,
  ...iconButtonProps
}: CopyToClipboardIconButtonProps) {
  return (
    <IconButtonTooltip
      tooltipTitle={tooltipTitle}
      {...iconButtonProps}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        onCopied?.();
      }}
    >
      <ContentCopyIcon fontSize="small" />
    </IconButtonTooltip>
  );
}
