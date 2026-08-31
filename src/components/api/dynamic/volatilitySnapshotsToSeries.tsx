import { type VolatilitySnapshot } from "@lib/brain/algorithms/type-execute";
import { type MultiLinePair } from "./api-dynamic-type";

export function volatilitySnapshotsToSeries(
    volatilitySnapshotUTC: VolatilitySnapshot[]
): Record<string, MultiLinePair> {
    volatilitySnapshotUTC.forEach((e) => {
        e.timeMs = Math.floor((e.timeMs ?? 0) / 1000);
    });

    const vSnapshots: Record<string, MultiLinePair> = {
        top: {
            series: [],
            names: []
        },
        bottom: {
            series: [],
            names: []
        }
    }

    // E.3 Level count multi line chart
    const levelMap: Record<string, { time: number; level: number }[]> = {};

    volatilitySnapshotUTC.forEach((e) => {
        for (const element of Object.keys(e.levelMap)) {
            if (!levelMap[element]) {
                levelMap[element] = [];
            }

            levelMap[element].push({
                time: e.timeMs,
                level: e.levelMap[element as any],
            });
        }
    });

    for (const element of Object.keys(levelMap)) {

        if (parseInt(element) < 0) {
            vSnapshots.bottom.series.push(levelMap[element]);
            vSnapshots.bottom.names.push("Level " + element);
        } else {
            vSnapshots.top.series.push(levelMap[element]);
            vSnapshots.top.names.push("Level " + element);
        }
    }

    return vSnapshots;
}
