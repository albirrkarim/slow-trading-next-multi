/**
 * @vitest-environment jsdom
 */

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CurrencyChart from "@/components/LiveDashboard/Shared/CurrencyChart";
import { TradingMode } from "@/lib/exchange";
import { createTestPosition } from "../fixtures/position";

const chartMocks = vi.hoisted(() => {
  const candlestickSeries = {
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(() => ({})),
    priceToCoordinate: vi.fn(() => 0),
    removePriceLine: vi.fn(),
    setData: vi.fn(),
  };
  const volumeSeries = {
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    setData: vi.fn(),
  };
  const markerPrimitive = { setMarkers: vi.fn() };
  const timeScale = {
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => null),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    timeToCoordinate: vi.fn(() => null),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const chart = {
    addSeries: vi.fn((seriesType: string) =>
      seriesType === "HistogramSeries" ? volumeSeries : candlestickSeries,
    ),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    removeSeries: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    timeScale: vi.fn(() => timeScale),
    unsubscribeCrosshairMove: vi.fn(),
  };

  return {
    candlestickSeries,
    chart,
    markerPrimitive,
    volumeSeries,
  };
});

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "CandlestickSeries",
  ColorType: { Solid: "Solid" },
  HistogramSeries: "HistogramSeries",
  LineSeries: "LineSeries",
  LineStyle: { Dashed: 2, Dotted: 1 },
  createChart: vi.fn(() => chartMocks.chart),
  createSeriesMarkers: vi.fn(() => chartMocks.markerPrimitive),
}));

describe("CurrencyChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows averaging fills and a dashed weighted-entry line", async () => {
    const entryTime = Date.parse("2026-03-01T00:30:00+07:00");
    const averagingTime = Date.parse("2026-03-02T04:30:00+07:00");
    const position = createTestPosition({
      averaging: {
        entryLevel: 2,
        executions: [
          {
            allocationPct: 2,
            level: 3,
            marginUsdt: 12,
            price: 2.15,
            t: averagingTime,
          },
        ],
        lastHandledLevel: 3,
        reserveBaseMarginUsdt: 6,
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
      direction: "SHORT",
      entryLevel: 2,
      entryPrice: 1.6339,
      entryTime,
      marginUsdt: 6,
      symbol: "ZRO",
      tradingMode: TradingMode.FUTURES,
    });
    position.exposure.averageEntryPrice = 1.9773;

    render(
      <CurrencyChart
        activePosition={position}
        dashedEntryPriceLine
        data={[
          {
            close: 1.7,
            high: 1.8,
            low: 1.6,
            open: 1.65,
            time: Math.floor(entryTime / 1000),
            volume: 100,
          },
        ]}
        entryOrders={[]}
      />,
    );

    await waitFor(() => {
      expect(chartMocks.markerPrimitive.setMarkers).toHaveBeenCalled();
      expect(chartMocks.candlestickSeries.createPriceLine).toHaveBeenCalled();
    });

    const markers = chartMocks.markerPrimitive.setMarkers.mock.calls.at(-1)?.[0];

    // BTEST:BACKTEST_TRADE_CHART_AVERAGING
    expect(markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          price: 1.6339,
          shape: "arrowUp",
          text: "ENTRY",
          time: Math.floor(entryTime / 1000),
        }),
        expect.objectContaining({
          price: 2.15,
          shape: "circle",
          text: "AVG $12.00 @ 2.15",
          time: Math.floor(averagingTime / 1000),
        }),
      ]),
    );
    expect(chartMocks.candlestickSeries.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({
        lineStyle: 2,
        price: 1.9773,
        title: "Avg Entry",
      }),
    );
  });
});
