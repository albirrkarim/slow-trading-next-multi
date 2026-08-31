"use client";

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, IconButton, type SxProps } from "@mui/material";
import { useState } from "react";

interface HeaderMetricsProps {
    defaultExpanded?: boolean;
    title: any;
    titleRight?: any;
    children: (expanded: boolean) => React.ReactNode;
    sx?: SxProps;
}

export default function HeaderMetrics({
    title,
    titleRight,
    children,
    defaultExpanded = false,
    sx = {},
}: HeaderMetricsProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    return (
        <Box sx={sx}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <div
                    style={{
                        width: "90%",
                    }}
                >
                    {title}
                </div>

                <div>
                    {titleRight}

                    <IconButton
                        onClick={() => {
                            setExpanded(!expanded);
                        }}
                        size="small"
                    >
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </div>
            </Box>

            {children(expanded)}
        </Box>
    );
}
