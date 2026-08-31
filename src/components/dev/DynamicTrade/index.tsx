"use client";

import dynamic from "next/dynamic";

const DynamicTrade = dynamic(() => import("./MainPage"), {
    ssr: false,
    loading: () => <p>Loading dynamic trade backtest...</p>,
});

export default function DynamicTradePage() {
    return (
        <DynamicTrade />
    )
}
