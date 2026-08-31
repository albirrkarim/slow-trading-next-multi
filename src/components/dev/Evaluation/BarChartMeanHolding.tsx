"use client";

import {
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import type { Aggregated } from "@/lib/evaluate/analysis/volatility";

interface Props {
    data: Aggregated[];
    height?: number
}

export default function BarChartMeanHolding({ data, height = 500 }: Props) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />

                {/* One bar per metric */}
                <Bar
                    dataKey="totalNetProfitUSDT"
                    fill="#1f77b4"
                    name="Total Net Profit (USDT)"
                />
                <Bar
                    dataKey="avgPercent"
                    fill="#ff7f0e"
                    name="Average % Gain"
                />
                <Bar
                    dataKey="frequency"
                    fill="#2ca02c"
                    name="Frequency (# of trades)"
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
