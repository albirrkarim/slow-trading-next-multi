"use client";

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, IconButton, type SxProps } from "@mui/material";
import { useMemo, useState } from "react";

const STORAGE_KEY_PREFIX = "slow-trading:header-metrics:expanded:";

interface HeaderMetricsProps {
    defaultExpanded?: boolean;
    rememberExpand?: boolean | string;
    title: React.ReactNode;
    titleRight?: React.ReactNode;
    children: (expanded: boolean) => React.ReactNode;
    sx?: SxProps;
    headerSx?: SxProps;
    headerCanBeClicked?: boolean;
}

function makeStorageKey(title: React.ReactNode) {
    if (typeof title !== "string") return null;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return null;
    return `${STORAGE_KEY_PREFIX}${encodeURIComponent(normalizedTitle)}`;
}

function resolveStorageKey(
    rememberExpand: HeaderMetricsProps["rememberExpand"],
    title: React.ReactNode,
) {
    if (!rememberExpand) return null;
    if (typeof rememberExpand === "string") {
        const normalizedKey = rememberExpand.trim();
        return normalizedKey
            ? `${STORAGE_KEY_PREFIX}${encodeURIComponent(normalizedKey)}`
            : null;
    }

    return makeStorageKey(title);
}

function readStoredExpanded(storageKey: string) {
    if (typeof window === "undefined") return null;

    try {
        const value = window.localStorage.getItem(storageKey);
        if (value === "true") return true;
        if (value === "false") return false;
    } catch {
        // Local storage can be unavailable in private or restricted contexts.
    }
    return null;
}

function writeStoredExpanded(storageKey: string, expanded: boolean) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(storageKey, String(expanded));
    } catch {
        // Local storage can be unavailable in private or restricted contexts.
    }
}

export default function HeaderMetrics({
    title,
    titleRight,
    children,
    defaultExpanded = false,
    rememberExpand = false,
    sx = {},
    headerSx = {},
    headerCanBeClicked = false,
}: HeaderMetricsProps) {
    const [expanded, setExpanded] = useState(() => {
        if (!rememberExpand) return defaultExpanded;
        const initialStorageKey = resolveStorageKey(rememberExpand, title);
        if (!initialStorageKey) return defaultExpanded;
        return readStoredExpanded(initialStorageKey) ?? defaultExpanded;
    });
    const storageKey = useMemo(
        () => resolveStorageKey(rememberExpand, title),
        [rememberExpand, title],
    );

    const toggleExpanded = () => {
        setExpanded((current) => {
            const next = !current;
            if (storageKey) writeStoredExpanded(storageKey, next);
            return next;
        });
    };

    return (
        <Box sx={sx}>
            <Box
                sx={[
                    {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: headerCanBeClicked ? "pointer" : "default",
                    },
                    ...(Array.isArray(headerSx) ? headerSx : [headerSx]),
                ]}
                onClick={() => {
                    if (headerCanBeClicked) {
                        toggleExpanded();
                    }
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {title}
                </Box>

                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                        gap: 1,
                    }}
                >
                    {titleRight}

                    <IconButton
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded();
                        }}
                        size="small"
                    >
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
            </Box>

            {children(expanded)}
        </Box>
    );
}
