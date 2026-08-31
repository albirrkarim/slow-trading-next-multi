import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { IconButton, Tooltip, type TypographyProps } from "@mui/material";
import * as React from "react";
import { tradeLog } from "@/lib/trading/helper/log";

type CopyTextProps = {
    text: string;
    label?: string;
    tooltip?: string;
    copiedTooltip?: string;
    typographyProps?: TypographyProps;
};

export function CopyText({
    text,
    label,
    tooltip = "Copy",
    copiedTooltip = "Copied",
}: CopyTextProps) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);

            window.setTimeout(() => {
                setCopied(false);
            }, 1500);
        } catch (error) {
            tradeLog.error("Failed to copy text:", error);
        }
    };

    return (
        <Tooltip title={copied ? copiedTooltip : tooltip}>
            <IconButton
                size="small"
                onClick={handleCopy}
                aria-label={`Copy ${label ?? text}`}
            >
                {copied ? (
                    <CheckIcon fontSize="inherit" />
                ) : (
                    <ContentCopyIcon fontSize="inherit" />
                )}
            </IconButton>
        </Tooltip>
    );
}
