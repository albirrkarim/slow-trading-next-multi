"use client";

import { Box, Chip, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DEFAULT_COLORS } from "@/components/client/constants";

export interface AssetPieChartProps {
    ariaLabel: string;
    dataObject: Record<string, number>;
    outcomeStats?: Record<string, { losses: number; wins: number }>;
}

export default function AssetPieChart({
    ariaLabel,
    dataObject,
    outcomeStats,
}: AssetPieChartProps) {
    const legendData = Object.entries(dataObject)
        .filter(([, value]) => Number.isFinite(value) && (outcomeStats ? value >= 0 : value > 0))
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
    const data = legendData
        .map((entry, colorIndex) => ({ ...entry, colorIndex }))
        .filter(({ value }) => value > 0);
    const total = data.reduce((sum, item) => sum + item.value, 0);

    if (legendData.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No trades available.
            </Typography>
        );
    }

    return (
        <Box aria-label={ariaLabel}>
            {data.length > 0 && (
                <Box sx={{ width: "100%", height: 280, minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={52}
                                outerRadius={105}
                                paddingAngle={1}
                                dataKey="value"
                                nameKey="name"
                            >
                                {data.map((entry) => (
                                    <Cell
                                        key={entry.name}
                                        fill={DEFAULT_COLORS[entry.colorIndex % DEFAULT_COLORS.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </Box>
            )}

            <Box
                aria-label={`${ariaLabel} legend`}
                sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}
            >
                {legendData.map((entry, index) => {
                    const stats = outcomeStats?.[entry.name];
                    const winRate = stats
                        ? (stats.wins / (stats.wins + stats.losses)) * 100
                        : 0;
                    const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];

                    return stats ? (
                        <Chip
                            key={entry.name}
                            size="small"
                            label={`${entry.name} w:${stats.wins} l:${stats.losses} | wr:${winRate.toFixed(1)}%`}
                            sx={{
                                borderColor: color,
                                borderStyle: "solid",
                                borderWidth: 1,
                                bgcolor: "transparent",
                                fontSize: "0.7rem",
                            }}
                            variant="outlined"
                        />
                    ) : (
                        <Box
                            key={entry.name}
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                        >
                            <Box
                                component="span"
                                sx={{
                                    width: 9,
                                    height: 9,
                                    flexShrink: 0,
                                    borderRadius: "50%",
                                    bgcolor: color,
                                }}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {entry.name} {entry.value} ({((entry.value / total) * 100).toFixed(1)}%)
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
