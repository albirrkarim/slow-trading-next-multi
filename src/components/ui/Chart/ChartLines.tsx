import React from "react";
import { Line } from "recharts";

interface ChartLinesProps {
    dataKeys: string[];
    seriesNames: string[];
    dataColors: string[];
    dataColorsMain: string[];
    visible: Set<string>;
    showTradeGroup: Record<string, boolean>;
}

function getTradeGroup(name: string) {
    if (!name.startsWith("TRADE ") && !name.startsWith("ENTRY ")) return null;

    return name.split(" ").slice(0, 2).join(" ");
}

const ChartLines: React.FC<ChartLinesProps> = React.memo(
    ({ dataKeys, seriesNames, dataColors, dataColorsMain, visible, showTradeGroup }) => {
        const lines = dataKeys.map((key, idx) => {
            const name = seriesNames[idx];
            const isGrouped = name.startsWith("TRADE ") || name.startsWith("ENTRY ");
            const isTradeSimulation = name.startsWith("TRADE SIMULATION");
            const isWorkerNeeded = name === "Worker Needed";
            const group = getTradeGroup(name);

            return {
                color: name.includes("ENTRY")
                    ? name.includes("SHORT") ? "red" : "green"
                    : ((isTradeSimulation || isGrouped) ? (dataColorsMain[idx] ?? dataColors[idx]) : dataColors[idx]),
                group,
                hidden:
                    !visible.has(key) || (group !== null && !showTradeGroup[group]),
                isGrouped,
                isTradeSimulation,
                isWorkerNeeded,
                key,
                name,
            };
        });

        const orderedLines = [
            ...lines.filter((line) => !line.isTradeSimulation),
            ...lines.filter((line) => line.isTradeSimulation),
        ];

        return (
            <>
                {orderedLines.map((line) => {
                    const {
                        color,
                        hidden,
                        isGrouped,
                        isTradeSimulation,
                        isWorkerNeeded,
                        key,
                        name,
                    } = line;

                    return (
                        <Line
                            key={key}
                            type={
                                isTradeSimulation
                                    ? "linear"
                                    : isWorkerNeeded
                                        ? "stepAfter"
                                        : "monotone"
                            }
                            dataKey={key}
                            stroke={color}
                            strokeWidth={isTradeSimulation ? 2 : isWorkerNeeded ? 3 : 1}
                            strokeOpacity={isTradeSimulation ? 1 : undefined}
                            dot={
                                isTradeSimulation
                                    ? { r: 5, fill: color, stroke: "#1f2937", strokeWidth: 1 }
                                    : isGrouped
                            }
                            activeDot={{ r: isTradeSimulation ? 9 : 5 }}
                            connectNulls
                            name={name}
                            isAnimationActive={false}
                            animationDuration={0}
                            hide={Boolean(hidden)}
                            style={
                                isTradeSimulation
                                    ? { filter: "drop-shadow(0 0 2px rgba(15, 23, 42, 0.65))" }
                                    : undefined
                            }
                        />
                    );
                })}
            </>
        );
    },
    // 🧠 Custom comparison to prevent unnecessary re-renders
    (prev, next) =>
        prev.dataKeys === next.dataKeys &&
        prev.seriesNames === next.seriesNames &&
        prev.dataColors === next.dataColors &&
        prev.dataColorsMain === next.dataColorsMain &&
        prev.visible === next.visible &&
        prev.showTradeGroup === next.showTradeGroup
);

export default ChartLines;
