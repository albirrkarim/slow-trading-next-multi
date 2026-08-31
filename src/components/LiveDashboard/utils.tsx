import { COLORS_BG } from "@/components/client/constants";
import { type VolatilityPoint } from "@/lib/dynamic";
import {
    convertVolatilityToLeveledMarkers,
    convertVolatilityToMarkers,
    type LeveledMarkers,
    type Marker,
} from "@/components/LiveDashboard/converter";

export const makeSeries = (data: Record<string, VolatilityPoint[]>, COLORS = COLORS_BG) => {
    const series: LeveledMarkers[][] = [];
    const markers: Marker[][] = [];

    let idx = 0;
    for (const symbol of Object.keys(data)) {
        series.push(
            convertVolatilityToLeveledMarkers(
                symbol,
                data[symbol],
                COLORS[idx % COLORS.length]
            )
        );

        markers.push(convertVolatilityToMarkers(data[symbol]));

        idx++;
    }

    return { series, markers };
};

export function msToLocalInput(ms?: number) {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

export function localInputToMs(value: string) {
    return value ? new Date(value).getTime() : undefined;
}

export function calculateTimeRange(range: string): {
    startTime: number;
    endTime: number;
} {
    const now = Date.now();
    const day = 1000 * 60 * 60 * 24;

    const map: Record<string, number> = {
        "1month": day * 30,
        "2month": day * 60,
        "3month": day * 90,
        "6month": day * 180,
        "1year": day * 365,
        "2year": day * 365 * 2,
        "3year": day * 365 * 3,
        "4year": day * 365 * 4,
        "5year": day * 365 * 5,
        "6year": day * 365 * 6,
        "7year": day * 365 * 7,
        "8year": day * 365 * 8,
        "9year": day * 365 * 9,
        "10year": day * 365 * 10,
    };

    const duration = map[range] ?? 0;
    const endTime = now;
    const startTime = now - duration;
    return { startTime, endTime };
}


export function applyTimeWindowClient(
    seriesArr: { time: number;[key: string]: any }[][],
    start: number,
    end: number,
    justCut = false
) {
    for (let i = 0; i < seriesArr.length; i++) {
        // 1️⃣ Filter points within the window
        const filtered = seriesArr[i].filter(
            (p) => p.time >= start && p.time <= end
        );

        // 2️⃣ If no data in range — leave it empty (no bumpers)
        if (filtered.length === 0) {
            seriesArr[i] = [];
            continue;
        }

        if (justCut) {
            seriesArr[i] = filtered;
            continue;
        }

        // 3️⃣ Clone first & last items for smooth start/end bumpers
        const firstBumper = { ...filtered[0], time: start };
        const lastBumper = { ...filtered[filtered.length - 1], time: end };

        // 4️⃣ Insert bumpers and keep sorted
        const withBumpers = [firstBumper, ...filtered, lastBumper].sort(
            (a, b) => a.time - b.time
        );

        // 5️⃣ Replace back into the array
        seriesArr[i] = withBumpers;
    }
}
