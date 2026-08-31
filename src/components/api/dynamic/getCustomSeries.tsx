import { type BacktestReturnDynamic } from "@/lib/dynamic";
import { type SeriesMinimal } from "./api-dynamic-type";

export function getCustomSeries(_cached: BacktestReturnDynamic): { names: string[], series: SeriesMinimal[][] } {
    const names: string[] = [];
    const series: { time: number; level: number }[][] = [];


    return {
        names,
        series,
    };
}