import React from "react";
import { Line } from "recharts";

interface ChartLinesProps {
    dataKeys: string[];
    seriesNames: string[];
    dataColors: string[];
    visible: Set<string>;
    showTradeGroup: Record<string, boolean>;
}

const ChartLines: React.FC<ChartLinesProps> = React.memo(
    ({ dataKeys, seriesNames, dataColors, visible, showTradeGroup }) => (
        <>
            {dataKeys.map((key, idx) => {
                const name = seriesNames[idx];
                const group = name.startsWith("TRADE ")
                    ? name.split(" ").slice(0, 2).join(" ")
                    : null;

                const hidden =
                    !visible.has(key) || (group && !showTradeGroup[group]);

                return (
                    <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={dataColors[idx]}
                        dot={name.includes("TRADE")}
                        activeDot={{ r: 5 }}
                        connectNulls
                        name={name}
                        isAnimationActive={false}
                        animationDuration={0}
                        hide={Boolean(hidden)}
                    />
                );
            })}
        </>
    )
    ,
    // 🧠 Custom comparison to prevent unnecessary re-renders
    (prev, next) =>
        prev.dataKeys === next.dataKeys &&
        prev.seriesNames === next.seriesNames &&
        prev.dataColors === next.dataColors &&
        prev.visible === next.visible &&
        prev.showTradeGroup === next.showTradeGroup
);

export default ChartLines;
