
"use client";

import type { LeveledMarkers } from "@/components/LiveDashboard/converter";

export function formatTimeISO(sec: number) {
    return new Date(sec * 1000).toISOString();
}

/** Build merged data and text maps (now includes numeric timeMs) */
export function buildMergedData(series: LeveledMarkers[][]) {
    const timesSet = new Set<number>();
    for (const s of series) {
        for (const m of s) timesSet.add(m.time);
    }
    const times = Array.from(timesSet).sort((a, b) => a - b);

    const data: Record<string, any>[] = [];
    const textMaps: Map<number, Map<number, string>> = new Map();

    series.forEach((s, si) => {
        const map = new Map<number, string>();
        for (const m of s) {
            map.set(m.time * 1000, m.text ?? "");
        }
        textMaps.set(si, map);
    });

    for (const t of times) {
        const row: Record<string, any> = {
            time: formatTimeISO(t),
            timeMs: t * 1000,
        };
        series.forEach((s, si) => {
            const marker = s.find((m) => m.time === t);
            row[`s${si}`] = marker ? marker.level : null;
        });
        data.push(row);
    }

    return { data, textMaps };
}