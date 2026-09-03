"use client";

import { useEffect, useMemo, useState } from "react";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Box,
  Button,
  Grid,
  LinearProgress,
  Typography,
  useMediaQuery,
} from "@mui/material";
import axios from "axios";
import { useSnackbar } from "notistack";

import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import { convertPositionIntoEntryExitPair } from "@/components/LiveDashboard/converter";
import { DEFAULT_COLORS } from "@/components/client/constants";
import { endpoints } from "@/components/endpoints";
import MultiLineTimelined from "@/components/ui/Chart/MultiLineTimelined";
import type { CoinTagState } from "@/lib/devBacktest/coins/tag-types";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { UnifiedFundingRate } from "@/lib/exchange";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading/helper/log";

import { delayExecution, queueExecution } from "../client/utils";
import CoinTagManagerDialog from "../dev/Coins/CoinTagManagerDialog";
import type { TagData } from "../dev/Coins/CoinTagManagerDialog";
import HeaderMetrics from "../ui/HeaderMetrics";
import TypographyTooltip from "../ui/TypographyTooltip";
import EntrySignals from "./Feature/EntrySignals";
import KlinesAndMarkers, { type KlineMarker } from "./Feature/KlinesAndMarkers";
import LatestVolatilityPoints from "./Feature/LatestVolatilityPoints";
import OpenPositions from "./Feature/OpenPositions";
import PriceNormFeature from "./Feature/PriceNorm";
import QuickBacktest from "./Feature/QuickBacktest";
import SlowTradingQueuesPanel from "./Feature/SlowTradingQueues";
import VPointsFrequency from "./Feature/VPointsFrequency";
import EntryBlockers from "./Feature/EntryBlockers";
import WorkerEntrySequenceMetrics from "./Feature/WorkerEntrySequenceMetrics";
import WorkerNeededEstimation from "./Feature/WorkerNeededEstimation";
import LiveDashboardNavbar from "./Navbar";
import BlackSwanStatusSection from "./BlackSwanStatusSection";
import DateSelectionDialog from "./Navbar/DateSelectionDialog";
import { DASHBOARD_POLL_INTERVAL_MS } from "./constants";
import { applyTimeWindowClient, calculateTimeRange, makeSeries } from "./utils";
import EntrySequenceMetrics from "./Feature/EntrySequences";
import CoinMetadataDownloadDialog from "./Feature/CoinMetadataDownloadDialog";
import {
  computeDayPreview,
  formatDailyPnlMetaTitle,
} from "./Navbar/helpers";

export interface DashboardConfig {
  range: string;
  startTime?: number;
  endTime?: number;
}

type QuickBacktestSimulationSeries = {
  names: string[];
  series: LeveledMarkers[][];
};

/**
 * Merges Quick Backtest simulation lines into the volatility chart while
 * keeping simulated trades colored exactly like their base vPoint coin line.
 */
function applyQuickBacktestSimulationToChartData(
  chartData: KlineMarker,
  simulationSeries: QuickBacktestSimulationSeries,
): KlineMarker {
  const coinColorMap: Record<string, string> = {};
  const keptSeries: LeveledMarkers[][] = [];
  const keptNames: string[] = [];

  chartData.names.forEach((name, index) => {
    if (!name.startsWith("TRADE ") && !name.startsWith("ENTRY ")) {
      const color = chartData.series[index]?.[0]?.color;
      if (color) {
        coinColorMap[name.trim().toUpperCase()] = color;
      }
    }

    if (!name.startsWith("TRADE SIMULATION")) {
      keptNames.push(name);
      keptSeries.push(chartData.series[index]);
    }
  });

  const coloredSimulationSeries = simulationSeries.series.map(
    (seriesItem, index) => {
      const symbol = simulationSeries.names[index]
        ?.replace(/^TRADE SIMULATION\s+/, "")
        .trim()
        .toUpperCase();
      const color = coinColorMap[symbol];

      return color
        ? seriesItem.map((point) => ({ ...point, color }))
        : seriesItem;
    },
  );

  return {
    ...chartData,
    names: [...keptNames, ...simulationSeries.names],
    series: [...keptSeries, ...coloredSimulationSeries],
  };
}

export default function DynamicTradeHistoryPage({
  appName,
}: {
  appName: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isMobile = useMediaQuery("(max-width:600px)");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [data, setData] = useState<KlineMarker | null>(null);
  const [volatilityMap, setVolatilityMap] = useState<Record<
    string,
    VolatilityPoint[]
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [reinitializing, setReinitializing] = useState(false);
  const [exitingSymbol, setExitingSymbol] = useState<string | null>(null);
  const [enteringSymbol, setEnteringSymbol] = useState<string | null>(null);
  const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null);
  const [resettingVPointUsed, setResettingVPointUsed] = useState(false);
  const [volume24hBySymbol, setVolume24hBySymbol] = useState<
    Record<string, number>
  >({});
  const [marketCapUSDBySymbol, setMarketCapUSDBySymbol] = useState<
    Record<string, number>
  >({});
  const [marketCapFetchedAtBySymbol, setMarketCapFetchedAtBySymbol] = useState<
    Record<string, number>
  >({});
  const [fundingRateBySymbol, setFundingRateBySymbol] = useState<
    Record<string, UnifiedFundingRate>
  >({});
  const [dashboardState, setDashboardState] =
    useState<SlowTradingDashboardState | null>(null);
  const [quickSimulationSeries, setQuickSimulationSeries] =
    useState<QuickBacktestSimulationSeries>({
      names: [],
      series: [],
    });
  const [coinMetadata, setCoinMetadata] = useState<CoinTagState>({
    coinDescriptions: {},
    coinTags: {},
    tags: [],
  });
  const [broadcastingCoinMetadata, setBroadcastingCoinMetadata] =
    useState(false);
  const [downloadingCoinMetadata, setDownloadingCoinMetadata] = useState(false);

  useEffect(() => {
    // PROD:DAILY_PNL_META_TITLE
    const dailyUsdtProfit = computeDayPreview(dashboardState).dailyUsdtProfit;
    document.title = formatDailyPnlMetaTitle(appName, dailyUsdtProfit);
  }, [appName, dashboardState]);

  const tagDescriptions = useMemo(
    () =>
      Object.fromEntries(
        coinMetadata.tags.map((tag) => [
          tag.text.toLocaleLowerCase(),
          tag.description,
        ]),
      ),
    [coinMetadata.tags],
  );
  const tagColors = useMemo(
    () =>
      Object.fromEntries(
        coinMetadata.tags.map((tag) => [
          tag.text.toLocaleLowerCase(),
          tag.color,
        ]),
      ),
    [coinMetadata.tags],
  );
  const showLocalCoinMetadataSyncControls = useMemo(() => {
    if (typeof window === "undefined") return false;

    const origin = window.location.origin.toLocaleLowerCase();
    return (
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://[::1]")
    );
  }, []);
  const [config, setConfig] = useState<DashboardConfig>({
    range: "1month",
    startTime: undefined,
    endTime: undefined,
  });

  function updateConfig(update: Partial<DashboardConfig>) {
    setConfig((prev) => ({ ...prev, ...update }));
  }

  function applyDashboardState(nextState: SlowTradingDashboardState) {
    setDashboardState(nextState);

    const symbolsLocal = Array.from(
      new Set([...nextState.config.symbols, "BTC"]),
    );
    setSymbols(symbolsLocal);

    return symbolsLocal;
  }

  const execute = async (reinitialize = false) => {
    if (reinitialize) {
      setReinitializing(true);
    } else {
      setLoading(true);
    }

    try {
      setData(null);

      const stateResp = await axios.get<SlowTradingDashboardState>(
        endpoints.slow.prod.storage,
      );
      const nextState = stateResp.data;
      const exchangeType = nextState.config.exchangeType;
      const symbolsLocal = applyDashboardState(nextState);

      const initialization = await axios.post<{
        data: {
          fundingRateBySymbol?: Record<string, UnifiedFundingRate>;
          marketCapFetchedAtBySymbol?: Record<string, number>;
          marketCapUSDBySymbol?: Record<string, number>;
          volume24hBySymbol?: Record<string, number>;
        };
      }>(endpoints.slow.dev.initialize, {
        symbols: symbolsLocal,
        reinitialize,
        exchangeType,
        verbose: true,
        logCategories: ["debug"],
      });
      setMarketCapUSDBySymbol(
        initialization.data.data.marketCapUSDBySymbol ?? {},
      );
      setFundingRateBySymbol(
        initialization.data.data.fundingRateBySymbol ?? {},
      );
      setMarketCapFetchedAtBySymbol(
        initialization.data.data.marketCapFetchedAtBySymbol ?? {},
      );
      setVolume24hBySymbol(initialization.data.data.volume24hBySymbol ?? {});

      const resp1 = await axios.post<{
        data: Record<string, VolatilityPoint[]>;
        series: LeveledMarkers[][];
      }>(endpoints.slow.dev.volatility, {
        symbols: symbolsLocal,
        range: config.range,
        startTime: config.startTime,
        endTime: config.endTime,
        verbose: true,
        logCategories: ["debug"],
        exchangeType,
      });

      const vMap = resp1.data.data;
      setVolatilityMap(vMap);

      const { series, markers } = makeSeries(vMap);

      const colorMapContrast = Object.fromEntries(
        symbolsLocal.map((symbol, index) => [
          symbol,
          DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        ]),
      );

      const chartPositions = [...nextState.history, ...nextState.openPositions];

      const tradePairs = convertPositionIntoEntryExitPair({
        positions: chartPositions,
        colorMap: colorMapContrast,
      });

      const names = [...symbolsLocal];
      for (const item of tradePairs) {
        names.push(`TRADE ${item[0].symbol}`);
      }

      const entrySignals = resp1.data.series;

      if (config.startTime && config.endTime) {
        applyTimeWindowClient(
          series,
          config.startTime / 1000,
          config.endTime / 1000,
          true,
        );

        applyTimeWindowClient(
          tradePairs,
          config.startTime / 1000,
          config.endTime / 1000,
          true,
        );

        applyTimeWindowClient(
          entrySignals,
          config.startTime / 1000,
          config.endTime / 1000,
          true,
        );
      }

      const entryDots = entrySignals.flat().map((item) => [item]);
      names.push(
        ...entryDots.map(
          (item) => `ENTRY ${item[0].level > 0 ? "SHORT" : "LONG"}`,
        ),
      );

      const finalSeries = [...series, ...tradePairs, ...entryDots];

      const chartData = {
        symbols: symbolsLocal,
        series: finalSeries,
        names,
        markers,
      };

      setData(
        applyQuickBacktestSimulationToChartData(
          chartData,
          quickSimulationSeries,
        ),
      );

      tradeLog.log({ vMap, tradeHistory: nextState.history, series });
    } catch (error) {
      tradeLog.error(error);
      alert(reinitialize ? "Reinitialize failed" : "Execution failed");
    } finally {
      if (reinitialize) {
        setReinitializing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void axios
      .get<CoinTagState>(endpoints.slow.prod.coinMetadata)
      .then((response) => setCoinMetadata(response.data))
      .catch((error) => tradeLog.error(error));
  }, []);

  useEffect(() => {
    delayExecution(
      () => {
        queueExecution(() => execute(), 500, "dashboard");
      },
      500,
      "home",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    const { startTime, endTime } = calculateTimeRange(config.range);
    updateConfig({ startTime, endTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isActive = true;

    const refreshDashboardState = async () => {
      try {
        const stateResp = await axios.get<SlowTradingDashboardState>(
          endpoints.slow.prod.storage,
        );

        if (!isActive) {
          return;
        }

        applyDashboardState(stateResp.data);
        try {
          const fundingResponse = await axios.post<{
            data: {
              fundingRateBySymbol?: Record<string, UnifiedFundingRate>;
            };
          }>(endpoints.slow.dev.fundingRates, {
            exchangeType: stateResp.data.config.exchangeType,
            symbols: Array.from(
              new Set([...stateResp.data.config.symbols, "BTC"]),
            ),
          });

          if (isActive) {
            setFundingRateBySymbol(
              fundingResponse.data.data.fundingRateBySymbol ?? {},
            );
          }
        } catch (error) {
          tradeLog.error(error);
        }
      } catch (error) {
        tradeLog.error(error);
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshDashboardState();
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const currentExchangeType =
    dashboardState?.config.exchangeType ?? "tokocrypto";

  const applyQuickBacktestSimulationSeries = (
    simulationSeries: QuickBacktestSimulationSeries,
  ) => {
    setQuickSimulationSeries(simulationSeries);
    setData((current) => {
      if (!current) return current;
      return applyQuickBacktestSimulationToChartData(current, simulationSeries);
    });
  };

  const resetAllVPointUsed = async () => {
    if (symbols.length === 0 || !dashboardState) {
      enqueueSnackbar("No volatility points are loaded yet", {
        variant: "warning",
      });
      return;
    }

    if (!confirm("Reset used volatility points for all visible coins?")) {
      return;
    }

    setResettingVPointUsed(true);
    try {
      await axios.post(endpoints.slow.dev.volatility, {
        symbols,
        range: config.range,
        startTime: config.startTime,
        endTime: config.endTime,
        exchangeType: currentExchangeType,
        removeUsed: true,
      });
      enqueueSnackbar("Reset used volatility points for all visible coins", {
        variant: "success",
      });
      await execute();
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        `Failed to reset volatility points: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setResettingVPointUsed(false);
    }
  };

  const manualExit = async (
    position: SlowTradingDashboardState["openPositions"][number],
  ) => {
    const { symbol } = position;
    if (!confirm(`Exit ${symbol} manually now?`)) {
      return;
    }

    setExitingSymbol(`${position.account}:${symbol}`);
    try {
      await axios.post(endpoints.slow.prod.exit, {
        account: position.account,
        symbol,
      });
      enqueueSnackbar(`Successfully exited ${symbol}`, { variant: "success" });
      await execute();
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        `Manual exit failed for ${symbol}: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setExitingSymbol(null);
    }
  };

  const manualEntry = async (symbol: string) => {
    setEnteringSymbol(symbol);
    try {
      const response = await axios.post<{
        success: boolean;
        executed?: boolean;
        message?: string;
      }>(endpoints.slow.prod.entry, {
        account: dashboardState?.runtime.exchangeAccountSlug,
        symbol,
      });

      if (response.data.executed) {
        enqueueSnackbar(
          response.data.message || `Successfully entered ${symbol}`,
          { variant: "success" },
        );
      } else {
        enqueueSnackbar(
          response.data.message ||
          `Manual entry did not open a position for ${symbol}`,
          { variant: "warning" },
        );
      }

      await execute();
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        `Manual entry failed for ${symbol}: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setEnteringSymbol(null);
    }
  };

  const deleteCoin = async (symbol: string) => {
    if (!dashboardState) return;

    const nextSymbols = dashboardState.config.symbols.filter(
      (configuredSymbol) => configuredSymbol.trim().toUpperCase() !== symbol,
    );
    if (nextSymbols.length === 0) {
      enqueueSnackbar("The trading config must contain at least one coin", {
        variant: "warning",
      });
      return;
    }
    if (!confirm(`Remove ${symbol} from the trading config?`)) return;

    setDeletingSymbol(symbol);
    try {
      const response = await axios.put<SlowTradingDashboardState>(
        endpoints.slow.prod.storage,
        { symbols: nextSymbols },
      );
      applyDashboardState(response.data);
      setVolatilityMap((current) => {
        if (!current) return current;
        const next = { ...current };
        delete next[symbol];
        return next;
      });
      enqueueSnackbar(`${symbol} removed from the trading config`, {
        variant: "success",
      });
      await execute();
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        `Failed to remove ${symbol}: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setDeletingSymbol(null);
    }
  };

  const updateCoinMetadata = async (
    symbol: string,
    update: { description: string } | { tags: string[] },
  ) => {
    try {
      const response = await axios.put<CoinTagState>(
        endpoints.slow.prod.coinMetadata,
        {
          symbol,
          ...update,
        },
      );
      setCoinMetadata(response.data);
    } catch (error: any) {
      tradeLog.error(error);
      enqueueSnackbar(
        error.response?.data?.error ?? "Failed to save coin metadata",
        { variant: "error" },
      );
    }
  };

  const downloadOnlineCoinMetadataToLocal = async (
    onlineBaseUrl: string,
  ): Promise<boolean> => {
    setDownloadingCoinMetadata(true);
    try {
      const response = await axios.post<{
        onlineBaseUrl: string;
        state: CoinTagState;
      }>(endpoints.slow.prod.syncOnlineCoinMetadataToLocal, {
        onlineBaseUrl,
      });
      setCoinMetadata(response.data.state);
      enqueueSnackbar(
        `Coin metadata downloaded from ${response.data.onlineBaseUrl}`,
        { variant: "success" },
      );
      return true;
    } catch (error: any) {
      const message =
        error.response?.data?.error ??
        "Failed to download online coin metadata";
      tradeLog.error(error);
      enqueueSnackbar(message, { variant: "error" });
      return false;
    } finally {
      setDownloadingCoinMetadata(false);
    }
  };

  const broadcastCoinMetadata = async () => {
    if (
      !confirm(
        "Broadcast current local coin tags and descriptions to fast.reinventwp.com, holy.reinventwp.com, and wealth.reinventwp.com?",
      )
    ) {
      return;
    }

    setBroadcastingCoinMetadata(true);
    try {
      const response = await axios.post<{
        failed: Array<{ error?: string; peer: string; status?: number }>;
        state: CoinTagState;
        succeeded: Array<{ peer: string }>;
      }>(endpoints.slow.prod.broadcastCoinMetadata, {});
      setCoinMetadata(response.data.state);
      if (response.data.failed.length > 0) {
        enqueueSnackbar(
          `Coin metadata broadcast: ${response.data.succeeded.length} succeeded, ${response.data.failed.length} failed`,
          { variant: "warning" },
        );
      } else {
        enqueueSnackbar(
          `Coin metadata broadcast to ${response.data.succeeded.length} online sites`,
          { variant: "success" },
        );
      }
    } catch (error: any) {
      const message =
        error.response?.data?.error ?? "Failed to broadcast coin metadata";
      tradeLog.error(error);
      enqueueSnackbar(message, { variant: "error" });
    } finally {
      setBroadcastingCoinMetadata(false);
    }
  };

  const createTag = async (tag: TagData) => {
    try {
      const response = await axios.post<CoinTagState>(
        endpoints.slow.prod.coinMetadata,
        tag,
      );
      setCoinMetadata(response.data);
    } catch (error: any) {
      const message =
        error.response?.data?.error ?? "Failed to create coin tag";
      tradeLog.error(error);
      enqueueSnackbar(message, { variant: "error" });
      throw new Error(message);
    }
  };

  const updateTag = async (tag: TagData) => {
    try {
      const response = await axios.patch<CoinTagState>(
        endpoints.slow.prod.coinMetadata,
        tag,
      );
      setCoinMetadata(response.data);
    } catch (error: any) {
      const message =
        error.response?.data?.error ?? "Failed to update coin tag";
      tradeLog.error(error);
      enqueueSnackbar(message, { variant: "error" });
      throw new Error(message);
    }
  };

  const deleteTag = async (tagId: number) => {
    try {
      const response = await axios.delete<CoinTagState>(
        endpoints.slow.prod.coinMetadata,
        {
          data: { tagId },
        },
      );
      setCoinMetadata(response.data);
    } catch (error: any) {
      const message =
        error.response?.data?.error ?? "Failed to delete coin tag";
      tradeLog.error(error);
      enqueueSnackbar(message, { variant: "error" });
      throw new Error(message);
    }
  };

  const VOLATILITY_POINT = (
    <HeaderMetrics
      defaultExpanded={!isMobile}
      headerCanBeClicked
      rememberExpand="volatility-points"
      title={
        <TypographyTooltip
          variant="body1"
          sx={{ fontWeight: "bold" }}
          gutterBottom
        >
          Volatility Points
        </TypographyTooltip>
      }
      titleRight={
        <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
          <DateSelectionDialog
            endTime={config.endTime}
            onEndTimeChange={(endTime) =>
              updateConfig({
                endTime,
                range: "custom",
              })
            }
            onRangeChange={(range, timeWindow) =>
              updateConfig({
                range,
                startTime: timeWindow?.startTime,
                endTime: timeWindow?.endTime,
              })
            }
            range={config.range}
            startTime={config.startTime}
            onStartTimeChange={(startTime) =>
              updateConfig({
                startTime,
                range: "custom",
              })
            }
          />
        </Box>
      }
    >
      {(expanded) =>
        expanded && (
          <Box>
            <Button
              disabled={loading || resettingVPointUsed}
              onClick={() => void resetAllVPointUsed()}
              size="small"
              startIcon={<RestartAltIcon fontSize="small" />}
              sx={{
                display: { xs: "none", sm: "inline-flex" },
              }}
              variant="outlined"
            >
              {resettingVPointUsed ? "Resetting..." : "Reset used vPoints"}
            </Button>
            {data ? (
              <MultiLineTimelined series={data.series} names={data.names} />
            ) : (
              <Typography color="text.secondary" variant="body2">
                Volatility points are loading...
              </Typography>
            )}
          </Box>
        )
      }
    </HeaderMetrics>
  )

  return (
    <Box>
      <LiveDashboardNavbar
        dashboardState={dashboardState}
        onRefresh={execute}
        onReinitialize={() => execute(true)}
        reinitializing={reinitializing}
      />
      {(loading || reinitializing) && (
        <LinearProgress
          aria-label={
            reinitializing ? "Reinitializing dashboard" : "Loading dashboard"
          }
          color={reinitializing ? "warning" : "primary"}
          sx={{ height: 3 }}
        />
      )}

      <Box sx={{ m: 1 }}>
        {dashboardState?.config.description?.trim() && (
          <Typography sx={{ mb: 1, whiteSpace: "pre-wrap" }} variant="body1">
            {dashboardState.config.description.trim()}
          </Typography>
        )}

        {!isMobile && (
          VOLATILITY_POINT
        )}

        {data && dashboardState && (
          <>
            {isMobile ? (
              <>
                <BlackSwanStatusSection
                  onRefresh={execute}
                  state={dashboardState}
                />

                <OpenPositions
                  availableTags={coinMetadata.tags.map((tag) => tag.text)}
                  coinDescriptions={coinMetadata.coinDescriptions}
                  coinTags={coinMetadata.coinTags}
                  config={dashboardState.config}
                  mode={dashboardState?.activeMode ?? "live"}
                  exchangeType={currentExchangeType}
                  positions={dashboardState?.openPositions ?? []}
                  spendableQuoteAsset={
                    dashboardState.balances.spendableQuoteAsset
                  }
                  exitingSymbol={exitingSymbol}
                  onCoinDescriptionChange={(symbol, description) =>
                    void updateCoinMetadata(symbol, { description })
                  }
                  onCoinTagsChange={(symbol, tags) =>
                    void updateCoinMetadata(symbol, { tags })
                  }
                  onExit={manualExit}
                  tagColors={tagColors}
                  tagDescriptions={tagDescriptions}
                  volatilityMap={volatilityMap ?? {}}
                  volume24hBySymbol={volume24hBySymbol}
                />

                {dashboardState && volatilityMap && (
                  <Box sx={{ my: 2 }}>
                    <WorkerEntrySequenceMetrics
                      dashboardState={dashboardState}
                    />

                    <EntrySequenceMetrics
                      endTime={config.endTime}
                      minActionableAbsoluteLevel={
                        dashboardState.config.minActionableAbsoluteLevel
                      }
                      startTime={config.startTime}
                      volatilityMap={volatilityMap}
                    />

                    <VPointsFrequency
                      endTime={config.endTime}
                      startTime={config.startTime}
                      volatilityMap={volatilityMap}
                    />

                    <EntryBlockers />
                  </Box>
                )}

                {isMobile && (
                  VOLATILITY_POINT
                )}
              </>
            ) : (
              <Grid container spacing={2}>
                <Grid size={{ xl: 4, lg: 3, md: 6, xs: 12 }}>
                  <BlackSwanStatusSection
                    onRefresh={execute}
                    state={dashboardState}
                  />

                  <EntrySignals
                    defaultExpanded={!isMobile}
                    exchangeType={currentExchangeType}
                  />
                </Grid>
                <Grid size={{ xl: 5, lg: 5, md: 6, xs: 12 }}>
                  <OpenPositions
                    availableTags={coinMetadata.tags.map((tag) => tag.text)}
                    coinDescriptions={coinMetadata.coinDescriptions}
                    coinTags={coinMetadata.coinTags}
                    config={dashboardState.config}
                    mode={dashboardState?.activeMode ?? "live"}
                    exchangeType={currentExchangeType}
                    positions={dashboardState?.openPositions ?? []}
                    spendableQuoteAsset={
                      dashboardState.balances.spendableQuoteAsset
                    }
                    exitingSymbol={exitingSymbol}
                    onCoinDescriptionChange={(symbol, description) =>
                      void updateCoinMetadata(symbol, { description })
                    }
                    onCoinTagsChange={(symbol, tags) =>
                      void updateCoinMetadata(symbol, { tags })
                    }
                    onExit={manualExit}
                    tagColors={tagColors}
                    tagDescriptions={tagDescriptions}
                    volatilityMap={volatilityMap ?? {}}
                    volume24hBySymbol={volume24hBySymbol}
                  />
                </Grid>
                {dashboardState && volatilityMap && (
                  <Grid size={{ xl: 3, lg: 4, md: 12, xs: 12 }}>
                    <WorkerEntrySequenceMetrics
                      dashboardState={dashboardState}
                    />

                    <EntrySequenceMetrics
                      endTime={config.endTime}
                      minActionableAbsoluteLevel={
                        dashboardState.config.minActionableAbsoluteLevel
                      }
                      startTime={config.startTime}
                      volatilityMap={volatilityMap}
                    />

                    <VPointsFrequency
                      endTime={config.endTime}
                      startTime={config.startTime}
                      volatilityMap={volatilityMap}
                    />

                    <EntryBlockers />
                  </Grid>
                )}
              </Grid>
            )}

            {volatilityMap && dashboardState && (
              <Box sx={{ my: 4 }}>
                <LatestVolatilityPoints
                  availableTags={coinMetadata.tags.map((tag) => tag.text)}
                  coinDescriptions={coinMetadata.coinDescriptions}
                  coinTags={coinMetadata.coinTags}
                  dashboardState={dashboardState}
                  volatilityMap={volatilityMap}
                  decisionEngineVersion={
                    dashboardState?.config.decisionEngineVersion
                  }
                  deletingSymbol={deletingSymbol}
                  enteringSymbol={enteringSymbol}
                  onDeleteCoin={deleteCoin}
                  onManualEntry={manualEntry}
                  onCoinDescriptionChange={(symbol, description) =>
                    void updateCoinMetadata(symbol, { description })
                  }
                  onCoinTagsChange={(symbol, tags) =>
                    void updateCoinMetadata(symbol, { tags })
                  }
                  tagManagerAction={
                    <>
                      <Box>
                        {showLocalCoinMetadataSyncControls && (
                          <Button
                            disabled={
                              broadcastingCoinMetadata ||
                              downloadingCoinMetadata
                            }
                            onClick={() => void broadcastCoinMetadata()}
                            size="small"
                            variant="contained"
                            sx={{ mr: 2 }}
                          >
                            {broadcastingCoinMetadata
                              ? "Broadcasting..."
                              : "Broadcast local metadata"}
                          </Button>
                        )}
                        {showLocalCoinMetadataSyncControls && (
                          <CoinMetadataDownloadDialog
                            disabled={broadcastingCoinMetadata}
                            downloading={downloadingCoinMetadata}
                            onDownload={downloadOnlineCoinMetadataToLocal}
                          />
                        )}
                      </Box>
                      <CoinTagManagerDialog
                        onCreate={createTag}
                        onCoinTagsChange={(symbol, tags) =>
                          updateCoinMetadata(symbol, { tags })
                        }
                        onDelete={deleteTag}
                        onUpdate={updateTag}
                        state={coinMetadata}
                      />
                    </>
                  }
                  tagColors={tagColors}
                  tagDescriptions={tagDescriptions}
                  fundingRateBySymbol={fundingRateBySymbol}
                  marketCapFetchedAtBySymbol={marketCapFetchedAtBySymbol}
                  marketCapUSDBySymbol={marketCapUSDBySymbol}
                  volume24hBySymbol={volume24hBySymbol}
                  openSymbols={(dashboardState?.openPositions ?? []).map(
                    (position) => position.symbol,
                  )}
                />
              </Box>
            )}
          </>
        )}

        <Box sx={{ my: 4 }}>
          <SlowTradingQueuesPanel dashboardState={dashboardState} />
        </Box>

        {volatilityMap && dashboardState && (
          <WorkerNeededEstimation
            config={dashboardState.config}
            endTime={config.endTime}
            startTime={config.startTime}
            volume24hBySymbol={volume24hBySymbol}
            volatilityMap={volatilityMap}
          />
        )}

        {volatilityMap && dashboardState && (
          <QuickBacktest
            dashboardState={dashboardState}
            endTime={config.endTime}
            range={config.range}
            startTime={config.startTime}
            volume24hBySymbol={volume24hBySymbol}
            volatilityMap={volatilityMap}
            onSimulationSeriesChange={applyQuickBacktestSimulationSeries}
          />
        )}

        <HeaderMetrics
          title={
            <Typography
              variant="body1"
              sx={{ fontWeight: "bold" }}
            >
              Price Normalized
            </Typography>
          }
        >
          {(expanded) => (
            <>
              {expanded && (
                <PriceNormFeature
                  symbols={symbols}
                  config={config}
                  exchangeType={currentExchangeType}
                />
              )}
            </>
          )}
        </HeaderMetrics>

        <KlinesAndMarkers data={data} exchangeType={currentExchangeType} />
      </Box>
    </Box>
  );
}
