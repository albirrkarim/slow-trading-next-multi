"use client";

import { DEFAULT_COLORS } from "@/components/client/constants";
import { type DynamicTradeBacktestReturn } from "@/components/api/dynamic/api-dynamic-type";
import {
    Button,
    Typography
} from "@mui/material";
import HeaderMetrics from "../../Evaluation/HeaderMetrics";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";

const ASSET_GROWTH_COLORS = [
    "#1f77b4", // Current Balance
    "#17becf", // Spendable Balance
    "#bc8f00", // Reserved Balance
    "#ff7f0e", // Current Asset
    "#2ca02c", // Current Asset Floating
    "#d62728", // Current Base Asset
    "#9467bd", // Current Safe Haven
    ...DEFAULT_COLORS,
];

export default function DebugSeries({ data }: { data: DynamicTradeBacktestReturn }) {

    return (
        <>
            <HeaderMetrics
                title={
                    <Button size="small" color="inherit">
                        Chart of Volatillity Rail
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {(expand && data.vPointsSeries) && (
                            <MultiLineTimelined
                                series={data.vPointsSeries.series}
                                names={data.vPointsSeries.names}
                            />
                        )}
                    </>
                )}
            </HeaderMetrics>

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit" disabled={data.priceSeries.series.length == 0}>
                        Chart of Prices
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {(expand && data.priceSeries) && (
                            <MultiLineTimelined
                                series={data.priceSeries.series}
                                names={data.priceSeries.names}
                                colors={DEFAULT_COLORS}
                            />
                        )}
                    </>
                )}
            </HeaderMetrics>

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit" disabled={(data.customSeries?.series ?? []).length == 0}>
                        Chart of Custom Series
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {expand && (
                            <>
                                {data.customSeries ? (
                                    <MultiLineTimelined
                                        series={data.customSeries?.series ?? []}
                                        names={data.customSeries?.names ?? []}
                                        colors={DEFAULT_COLORS}
                                    />
                                ) : (
                                    <Typography>No data</Typography>
                                )}
                            </>
                        )}
                    </>
                )}
            </HeaderMetrics>

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit" disabled={(data.vSnapshots.top?.series ?? []).length == 0}>
                        Chart of Volatility Snapshots TOP
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {expand && (
                            <>
                                {data.vSnapshots.top ? (
                                    <MultiLineTimelined
                                        series={data.vSnapshots.top?.series ?? []}
                                        names={data.vSnapshots.top?.names ?? []}
                                        colors={DEFAULT_COLORS}
                                    // height={400}
                                    />
                                ) : (
                                    <Typography>No data</Typography>
                                )}
                            </>
                        )}
                    </>
                )}
            </HeaderMetrics>

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit" disabled={(data.vSnapshots.bottom?.series ?? []).length == 0}>
                        Chart of Volatility Snapshots BOTTOM
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {expand && (
                            <>
                                {data.vSnapshots.bottom ? (
                                    <MultiLineTimelined
                                        series={data.vSnapshots.bottom?.series ?? []}
                                        names={data.vSnapshots.bottom?.names ?? []}
                                        colors={DEFAULT_COLORS}
                                    // height={400}
                                    />
                                ) : (
                                    <Typography>No data</Typography>
                                )}
                            </>
                        )}
                    </>
                )}
            </HeaderMetrics>

            <HeaderMetrics
                title={
                    <Button size="small" color="inherit" disabled={(data.growthOvertimeSeries?.series ?? []).length == 0}>
                        Chart of Asset Growth Overtime
                    </Button>
                }
            >
                {(expand) => (
                    <>
                        {expand && (
                            <>
                                {data.growthOvertimeSeries ? (
                                    <MultiLineTimelined
                                        series={data.growthOvertimeSeries?.series ?? []}
                                        names={data.growthOvertimeSeries?.names ?? []}
                                        colors={ASSET_GROWTH_COLORS}
                                    />
                                ) : (
                                    <Typography>No data</Typography>
                                )}
                            </>
                        )}
                    </>
                )}
            </HeaderMetrics>
        </>
    )
}
