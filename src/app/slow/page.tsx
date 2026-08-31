import type { Metadata } from "next";

import LiveDashboard from "@/components/LiveDashboard";

const appName = String(process.env.APP_NAME ?? "SLOW").trim() || "SLOW";

export const metadata: Metadata = {
    title: `${appName} | +$0.00`,
    description:
        "SLOW dashboard for managing seasonal slow-trading configuration, balances, volatility signals, open positions, and live execution state.",
};

export default function Home() {
    return <LiveDashboard appName={appName} />;
}
