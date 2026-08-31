"use client";

import { useEffect, useState } from "react";
import { Typography } from "@mui/material";

export default function UtcClock() {
    const [time, setTime] = useState<string>("");

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const day = String(now.getUTCDate()).padStart(2, "0");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const month = months[now.getUTCMonth()];
            const hours = String(now.getUTCHours()).padStart(2, "0");
            const minutes = String(now.getUTCMinutes()).padStart(2, "0");
            const seconds = String(now.getUTCSeconds()).padStart(2, "0");

            const formatted = `${day} ${month} ${hours}:${minutes}:${seconds}`;
            setTime(formatted);
        };

        updateTime(); // initial render
        const interval = setInterval(updateTime, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <Typography
            variant="body1"
            sx={{
                fontFamily: "monospace",
                opacity: 0.85,
                userSelect: "none",
            }}
        >
            {time}
        </Typography>
    );
}
