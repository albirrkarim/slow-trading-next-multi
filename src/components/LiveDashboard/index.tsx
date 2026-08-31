"use client";

import { Typography } from "@mui/material";
import dynamic from "next/dynamic";

const LiveDashboardPage = dynamic(() => import("./LiveDashboardPage"), {
    ssr: false,
    loading: () => <Typography sx={{ m: 1 }}>Loading dashboard...</Typography>,
});

export default function LiveDashboard({ appName }: { appName: string }) {
    return <LiveDashboardPage appName={appName} />;
}
