import { type GrowthOvertimeDetail } from "@/lib/dynamic/backtest-volatility/type";
import type { SeriesMinimal } from "./api-dynamic-type";

export function growOvertimeToSeries(
    growthOvertimeUTC: GrowthOvertimeDetail[]
) {
    growthOvertimeUTC.forEach((e) => {
        e.timeMs = Math.floor((e.timeMs ?? 0) / 1000);
    });

    const currentBalance = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentBalance,
    }));

    const currentSpendableBalance = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentSpendableBalance ?? e.currentBalance,
    }));

    const currentReservedBalance = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentReservedBalance ?? 0,
    }));

    const currentAsset = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentAsset,
    }));

    const currentAssetFloating = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentAssetFloating,
    }));

    const currentBaseAsset = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentBaseAsset,
    }));

    const currentSafeHaven = growthOvertimeUTC.map((e) => ({
        time: e.timeMs,
        level: e.currentSafeHaven,
    }));

    const assetCoins: Record<string, SeriesMinimal[]> = {}

    for (const item of growthOvertimeUTC) {
        for (const coin of Object.keys(item.currentBaseAssetPercentCoin)) {
            if (!assetCoins[coin]) {
                assetCoins[coin] = []
            }

            assetCoins[coin].push({
                time: item.timeMs,
                level: item.currentBaseAssetPercentCoin[coin] * item.currentBaseAsset
            })
        }
    }

    const namesGrowth = [
        "Current Balance",
        "Spendable Balance",
        "Reserved Balance",
        "Current Asset",
        "Current Asset Floating",
        "Current Base Asset",
        "Current Safe Haven",
        ...Object.keys(assetCoins)
    ];

    const seriesGrowth = [
        currentBalance,
        currentSpendableBalance,
        currentReservedBalance,
        currentAsset,
        currentAssetFloating,
        currentBaseAsset,
        currentSafeHaven,
        ...Object.values(assetCoins)
    ];

    return {
        series: seriesGrowth,
        names: namesGrowth,
    };
}
