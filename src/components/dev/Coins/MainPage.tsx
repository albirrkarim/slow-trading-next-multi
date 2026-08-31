"use client";

import { endpoints } from "@/components/endpoints";
import SidebarButton from "@/components/ui/SidebarButton";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import {
  hasActiveCoinFilterConfig,
  mergeCoinFilterConfigs,
  type CoinFilterConfig,
} from "@/lib/devBacktest/coins/filter-config";
import type {
  CoinFinderJob,
  CoinFinderRange,
  CoinFinderResult,
  CoinFinderVolatilityMap,
} from "@/lib/devBacktest/coins/types";
import type { CoinTagState } from "@/lib/devBacktest/coins/tag-types";
import coinCapitalEfficiency from "@/lib/devBacktest/coins/capital-efficiency";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  LinearProgress,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import CoinResultsTable from "./CoinResultsTable";
import CoinVolatilityChart from "./CoinVolatilityChart";
import CoinCorrelationChart from "./CoinCorrelationChart";
import CoinCandidateFilters from "./CoinCandidateFilters";
import CoinFilterConfigDialog from "./CoinFilterConfigDialog";
import CoinTagManagerDialog from "./CoinTagManagerDialog";
import type { TagData } from "./CoinTagManagerDialog";
import CoinTagSelect from "./CoinTagSelect";
import CoinThresholdSlider from "./CoinThresholdSlider";
import { summarizeCoinFinderJobErrors } from "./job-errors";
import { buildCoinTagFilterAssignment } from "./tag-filter-assignment";
import { filterCoinResults, filterCoinResultsByTags } from "./result";
import { calculateCoinMonthlyMetrics } from "./threshold-analysis";
import coinFinderPreferences from "./preferences";

const POLL_INTERVAL_MS = 5_000;
const RANGE_OPTIONS: Array<{ label: string; value: CoinFinderRange }> = [
  { label: "6 months", value: "6month" },
  { label: "1 year", value: "1year" },
  { label: "2 years", value: "2year" },
  { label: "3 years", value: "3year" },
  { label: "4 years", value: "4year" },
  { label: "5 years", value: "5year" },
];

function parseSymbols(value: string) {
  return value
    .split(/[\s,]+/)
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalJob(job: CoinFinderJob) {
  return job.status === "completed" || job.status === "cancelled";
}

function getMaximumAvailableLevel(volatilityMap: CoinFinderVolatilityMap) {
  let maximumLevel = 5;
  for (const points of Object.values(volatilityMap)) {
    for (const point of points) {
      const level = Math.abs(point.lvl);
      if (level > maximumLevel) maximumLevel = level;
    }
  }
  return maximumLevel;
}

function getEffectiveThreshold({
  maximumAvailableLevel,
  threshold,
}: {
  maximumAvailableLevel: number;
  threshold: [number, number];
}): [number, number] {
  return [
    Math.min(threshold[0], maximumAvailableLevel - 1),
    Math.min(threshold[1], maximumAvailableLevel),
  ];
}

function addMonthlyMetrics({
  results,
  threshold,
  volatilityMap,
}: {
  results: CoinFinderResult[];
  threshold: [number, number];
  volatilityMap: CoinFinderVolatilityMap;
}) {
  return results.map((result) => ({
    ...result,
    ...calculateCoinMonthlyMetrics({
      maximumLevel: threshold[1],
      minimumLevel: threshold[0],
      points: volatilityMap[result.symbol] ?? [],
      symbol: result.symbol,
    }),
  }));
}

export default function CoinFinderPage() {
  const [initialPreferences] = useState(() => coinFinderPreferences.read());
  const [symbolsInput, setSymbolsInput] = useState(
    initialPreferences.symbolsInput,
  );
  const [range, setRange] = useState<CoinFinderRange>(initialPreferences.range);
  const [useCachedVPoints, setUseCachedVPoints] = useState(
    initialPreferences.useCachedVPoints,
  );
  const [combinationSize, setCombinationSize] = useState(
    initialPreferences.combinationSize,
  );
  const deferredCombinationSize = useDeferredValue(combinationSize);
  const [filterConfig, setFilterConfig] = useState<CoinFilterConfig>(
    initialPreferences.filterConfig,
  );
  const deferredFilterConfig = useDeferredValue(filterConfig);
  const [filterPresetTags, setFilterPresetTags] = useState<string[]>(
    initialPreferences.filterPresetTags,
  );
  const [threshold, setThreshold] = useState<[number, number]>(
    initialPreferences.threshold,
  );
  const [job, setJob] = useState<CoinFinderJob | null>(null);
  const [results, setResults] = useState<CoinFinderResult[]>([]);
  const [volatilityMap, setVolatilityMap] = useState<CoinFinderVolatilityMap>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [tagState, setTagState] = useState<CoinTagState>({
    coinDescriptions: {},
    coinTags: {},
    tags: [],
  });
  const tagOptions = useMemo(
    () => tagState.tags.map((tag) => tag.text),
    [tagState.tags],
  );
  const tagColors = useMemo(
    () =>
      Object.fromEntries(
        tagState.tags.map((tag) => [tag.text.toLocaleLowerCase(), tag.color]),
      ),
    [tagState.tags],
  );
  const tagDescriptions = useMemo(
    () =>
      Object.fromEntries(
        tagState.tags.map((tag) => [
          tag.text.toLocaleLowerCase(),
          tag.description,
        ]),
      ),
    [tagState.tags],
  );
  const filterTagOptions = useMemo(
    () =>
      tagState.tags
        .filter((tag) => hasActiveCoinFilterConfig(tag.filters ?? null))
        .map((tag) => tag.text),
    [tagState.tags],
  );

  useEffect(() => {
    let active = true;
    void axios
      .get<CoinTagState>(endpoints.dev.coinTags)
      .then((response) => {
        if (active) setTagState(response.data);
      })
      .catch((requestError: any) => {
        if (active) {
          setError(
            requestError?.response?.data?.error ?? "Failed to load coin tags",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    coinFinderPreferences.write({
      combinationSize,
      filterConfig,
      filterPresetTags,
      range,
      symbolsInput,
      threshold,
      useCachedVPoints,
    });
  }, [
    combinationSize,
    filterConfig,
    filterPresetTags,
    range,
    symbolsInput,
    threshold,
    useCachedVPoints,
  ]);
  const running = job?.status === "queued" || job?.status === "running";
  const symbolCount = useMemo(
    () => parseSymbols(symbolsInput).length,
    [symbolsInput],
  );
  const jobErrorSummaries = useMemo(
    () => summarizeCoinFinderJobErrors(job?.errors ?? []),
    [job?.errors],
  );
  const maximumAvailableLevel = useMemo(
    () => getMaximumAvailableLevel(volatilityMap),
    [volatilityMap],
  );
  const effectiveThreshold = useMemo<[number, number]>(
    () => getEffectiveThreshold({ maximumAvailableLevel, threshold }),
    [maximumAvailableLevel, threshold],
  );
  const resultsWithMonthlyMetrics = useMemo(
    () =>
      addMonthlyMetrics({
        results,
        threshold: effectiveThreshold,
        volatilityMap,
      }),
    [effectiveThreshold, results, volatilityMap],
  );
  const metricEligibleResults = useMemo(
    () =>
      filterCoinResults({
        filters: deferredFilterConfig.filters,
        results: resultsWithMonthlyMetrics,
      }),
    [deferredFilterConfig.filters, resultsWithMonthlyMetrics],
  );
  const eligibleResults = useMemo(
    () =>
      filterCoinResultsByTags({
        coinTags: tagState.coinTags,
        requiredTags: deferredFilterConfig.requiredTags,
        results: metricEligibleResults,
      }),
    [
      deferredFilterConfig.requiredTags,
      metricEligibleResults,
      tagState.coinTags,
    ],
  );
  const eligibleSymbols = useMemo(
    () => new Set(eligibleResults.map((result) => result.symbol)),
    [eligibleResults],
  );
  const eligibleVolatilityMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(volatilityMap).filter(([symbol]) =>
          eligibleSymbols.has(symbol),
        ),
      ),
    [eligibleSymbols, volatilityMap],
  );
  const combinationAnalysis = useMemo(
    () =>
      coinCapitalEfficiency.selectBestCombination({
        maximumLevel: effectiveThreshold[1],
        minimumLevel: effectiveThreshold[0],
        requestedSize: deferredCombinationSize,
        volatilityMap: eligibleVolatilityMap,
      }),
    [deferredCombinationSize, effectiveThreshold, eligibleVolatilityMap],
  );
  const selectedSymbols = useMemo(
    () => new Set(combinationAnalysis.symbols),
    [combinationAnalysis.symbols],
  );
  const selectedVolatilityMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(eligibleVolatilityMap).filter(
          ([symbol]) =>
            deferredCombinationSize === 0 || selectedSymbols.has(symbol),
        ),
      ),
    [deferredCombinationSize, eligibleVolatilityMap, selectedSymbols],
  );
  const selectedResults = useMemo(() => {
    const visible = eligibleResults.filter(
      (result) =>
        deferredCombinationSize === 0 || selectedSymbols.has(result.symbol),
    );
    const visibleSymbols = new Set(visible.map((result) => result.symbol));

    return visible.map((result) => {
      const correlations = Object.fromEntries(
        Object.entries(result.correlations ?? {}).filter(([symbol]) =>
          visibleSymbols.has(symbol),
        ),
      );
      const scores = Object.values(correlations);
      return {
        ...result,
        correlationScore:
          scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : null,
        correlations,
      };
    });
  }, [deferredCombinationSize, eligibleResults, selectedSymbols]);
  const overallProgress = job
    ? Math.min(
      100,
      job.progress.stage === "validating"
        ? (job.progress.validationCompleted /
          Math.max(1, job.progress.validationTotal)) *
        100
        : ((job.progress.completed +
          job.progress.currentSymbolPercent / 100) /
          Math.max(1, job.progress.total)) *
        100,
    )
    : 0;

  const applyTagFiltersToCurrentConfig = (tags: string[]) => {
    setFilterPresetTags(tags);
    const selectedConfigs = tags
      .map((tag) =>
        tagState.tags.find(
          (item) => item.text.toLocaleLowerCase() === tag.toLocaleLowerCase(),
        ),
      )
      .map((tag) => tag?.filters ?? null)
      .filter((config): config is CoinFilterConfig =>
        hasActiveCoinFilterConfig(config),
      );

    if (selectedConfigs.length > 0) {
      setFilterConfig((current) =>
        mergeCoinFilterConfigs(current, selectedConfigs),
      );
    }
  };

  const saveRunTagFilterAssignments = async ({
    nextResults,
    nextVolatilityMap,
  }: {
    nextResults: CoinFinderResult[];
    nextVolatilityMap: CoinFinderVolatilityMap;
  }) => {
    if (
      nextResults.length === 0 ||
      !tagState.tags.some((tag) => hasActiveCoinFilterConfig(tag.filters ?? null))
    ) {
      return;
    }

    const nextMaximumLevel = getMaximumAvailableLevel(nextVolatilityMap);
    const nextThreshold = getEffectiveThreshold({
      maximumAvailableLevel: nextMaximumLevel,
      threshold,
    });
    const assignment = buildCoinTagFilterAssignment({
      coinTags: tagState.coinTags,
      results: addMonthlyMetrics({
        results: nextResults,
        threshold: nextThreshold,
        volatilityMap: nextVolatilityMap,
      }),
      tags: tagState.tags,
    });

    if (!assignment.changed) return;

    try {
      const response = await axios.put<CoinTagState>(endpoints.dev.coinTags, {
        coinTags: assignment.coinTags,
      });
      setTagState(response.data);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
        "Finished run, but failed to auto-assign tag filters",
      );
    }
  };

  const run = async () => {
    setError(null);
    setResults([]);
    setVolatilityMap({});

    try {
      const response = await axios.post<CoinFinderJob>(endpoints.dev.coins, {
        range,
        symbols: parseSymbols(symbolsInput),
        useCachedVPoints,
      });
      let nextJob = response.data;
      setJob(nextJob);

      while (!isTerminalJob(nextJob)) {
        await wait(POLL_INTERVAL_MS);
        const poll = await axios.get<CoinFinderJob>(endpoints.dev.coins, {
          params: { jobId: nextJob.id },
        });
        nextJob = poll.data;
        setJob(nextJob);
        setResults(nextJob.results);
      }

      setResults(nextJob.results);
      if (nextJob.results.length > 0) {
        let nextVolatilityMap: CoinFinderVolatilityMap = {};
        try {
          const volatilityResponse = await axios.get<CoinFinderVolatilityMap>(
            endpoints.dev.coins,
            { params: { action: "volatility", jobId: nextJob.id } },
          );
          nextVolatilityMap = volatilityResponse.data;
          setVolatilityMap(nextVolatilityMap);
        } catch (volatilityError: any) {
          setError(
            volatilityError?.response?.data?.error ??
            "Failed to load combined volatility chart",
          );
        }
        await saveRunTagFilterAssignments({
          nextResults: nextJob.results,
          nextVolatilityMap,
        });
      }
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? requestError.message);
      setJob(null);
    }
  };

  const cancel = async () => {
    if (!job || !running) return;

    try {
      const response = await axios.delete<CoinFinderJob>(endpoints.dev.coins, {
        params: { jobId: job.id },
      });
      setJob(response.data);
      setResults(response.data.results);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error ?? requestError.message);
    }
  };

  const updateCoinTags = async (symbol: string, tags: string[]) => {
    const previous = tagState.coinTags[symbol] ?? [];
    setTagState((current) => ({
      coinDescriptions: current.coinDescriptions,
      coinTags: { ...current.coinTags, [symbol]: tags },
      tags: current.tags,
    }));

    try {
      const response = await axios.put<CoinTagState>(endpoints.dev.coinTags, {
        symbol,
        tags,
      });
      setTagState(response.data);
    } catch (requestError: any) {
      setTagState((current) => ({
        ...current,
        coinTags: { ...current.coinTags, [symbol]: previous },
      }));
      setError(
        requestError?.response?.data?.error ?? "Failed to save coin tags",
      );
    }
  };

  const updateCoinDescription = async (symbol: string, description: string) => {
    try {
      const response = await axios.put<CoinTagState>(endpoints.dev.coinTags, {
        description,
        symbol,
      });
      setTagState(response.data);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
        "Failed to save coin description",
      );
    }
  };

  const createTag = async (tagData: TagData) => {
    try {
      const response = await axios.post<CoinTagState>(endpoints.dev.coinTags, tagData);
      setTagState(response.data);
    } catch (requestError: any) {
      const message =
        requestError?.response?.data?.error ?? "Failed to create coin tag";
      setError(message);
      throw new Error(message);
    }
  };

  const updateTag = async (
    tagData: TagData
  ) => {
    const previous = tagState.tags.find((tag) => tag.tagId === tagData.tagId);
    try {
      const response = await axios.patch<CoinTagState>(endpoints.dev.coinTags, tagData);
      setTagState(response.data);
      if (previous && previous.text !== tagData.text.trim()) {
        setFilterConfig((current) => ({
          ...current,
          requiredTags: current.requiredTags.map((tag) =>
            tag.toLocaleLowerCase() === previous.text.toLocaleLowerCase()
              ? tagData.text.trim()
              : tag,
          ),
        }));
        setFilterPresetTags((current) =>
          current.map((tag) =>
            tag.toLocaleLowerCase() === previous.text.toLocaleLowerCase()
              ? tagData.text.trim()
              : tag,
          ),
        );
      }
    } catch (requestError: any) {
      const message =
        requestError?.response?.data?.error ?? "Failed to update coin tag";
      setError(message);
      throw new Error(message);
    }
  };

  const deleteTag = async (tagId: number) => {
    const deleted = tagState.tags.find((tag) => tag.tagId === tagId);
    try {
      const response = await axios.delete<CoinTagState>(
        endpoints.dev.coinTags,
        { data: { tagId } },
      );
      setTagState(response.data);
      if (deleted) {
        setFilterConfig((current) => ({
          ...current,
          requiredTags: current.requiredTags.filter(
            (tag) =>
              tag.toLocaleLowerCase() !== deleted.text.toLocaleLowerCase(),
          ),
        }));
        setFilterPresetTags((current) =>
          current.filter(
            (tag) =>
              tag.toLocaleLowerCase() !== deleted.text.toLocaleLowerCase(),
          ),
        );
      }
    } catch (requestError: any) {
      const message =
        requestError?.response?.data?.error ?? "Failed to delete coin tag";
      setError(message);
      throw new Error(message);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          gap: 1,
          minHeight: 36,
          backgroundColor: "background.paper"
        }}
      >
        <SidebarButton />
        <Typography fontWeight={600} variant="subtitle1">
          Good Coin Finder
        </Typography>
        <Box sx={{ ml: "auto" }}>
          <CoinTagManagerDialog
            onCreate={createTag}
            onCoinTagsChange={updateCoinTags}
            onDelete={deleteTag}
            onUpdate={updateTag}
            state={tagState}
          />
        </Box>
      </Box>

      <Box sx={{ p: 1 }}>

        <Grid container spacing={4} sx={{ mt: 0.5 }}>
          <Grid
            size={{
              lg: 6,
              xl: 6,
            }}
          >

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1
              }}
            >
              <Typography fontWeight={600} variant="body2" sx={{ mb: 0.5 }}>
                A. Input
              </Typography>
              <Box
                sx={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  mt: 0.75,
                }}
              >
                <FormControl size="small" sx={{ minWidth: 132 }}>
                  <Select
                    disabled={running}
                    onChange={(event) =>
                      setRange(event.target.value as CoinFinderRange)
                    }
                    value={range}
                  >
                    {RANGE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Switch
                      checked={useCachedVPoints}
                      disabled={running}
                      onChange={(event) =>
                        setUseCachedVPoints(event.target.checked)
                      }
                      size="small"
                    />
                  }
                  label="Use cached vPoints"
                  sx={{
                    m: 0,
                    ".MuiFormControlLabel-label": { fontSize: "0.875rem" },
                  }}
                />
                <Button
                  disabled={running}
                  onClick={() => void run()}
                  size="small"
                  startIcon={<PlayArrowIcon />}
                  variant="contained"
                >
                  Run
                </Button>
                {running && (
                  <Button
                    color="error"
                    onClick={() => void cancel()}
                    size="small"
                    startIcon={<StopIcon />}
                    variant="outlined"
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Box>
            <TextField
              disabled={running}
              fullWidth
              label="Symbols"
              maxRows={2}
              minRows={1}
              multiline
              onChange={(event) => setSymbolsInput(event.target.value)}
              placeholder="SOL, ETH, BTC, ..."
              size="small"
              value={symbolsInput}
            />
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              Total : {symbolCount}
            </Typography>

            {job && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={overallProgress}
                />
                <Typography variant="body2" sx={{ mt: 0.75 }}>
                  {job.status === "cancelled"
                    ? `Cancelled after processing ${job.progress.completed} symbols`
                    : job.status === "completed"
                      ? `Completed ${job.progress.completed}/${job.progress.total}`
                      : job.progress.stage === "validating"
                        ? `Checking Binance Futures symbol ${job.progress.currentSymbol ?? "…"} · ${job.progress.validationCompleted}/${job.progress.validationTotal}`
                        : `${job.progress.currentSymbol ?? "Starting"} · ${job.progress.currentSymbolPercent}% · ${job.progress.completed}/${job.progress.total} valid symbols`}
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 1, py: 0 }}>
                {error}
              </Alert>
            )}
            {jobErrorSummaries.map((summary) => (
              <Alert
                severity="warning"
                sx={{ mt: 0.75, py: 0 }}
                key={summary.key}
              >
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {summary.count} {summary.count === 1 ? "symbol" : "symbols"}{" "}
                  skipped:{" "}
                </Box>
                {summary.message}
                <Typography component="div" variant="body2" sx={{ mt: 0.5 }}>
                  {summary.visibleSymbols.join(", ")}
                  {summary.hiddenCount > 0 &&
                    `, +${summary.hiddenCount} more`}
                </Typography>
              </Alert>
            ))}

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{
                alignItems: "center",
                display: "flex",
                justifyContent: "space-between",
                gap: 1,
                mb: 0.75,
              }}
            >
              <Typography fontWeight={600} variant="body2">
                B. Filtering
              </Typography>

              <Box sx={{ width: "60%" }}>
                <CoinTagSelect
                  allowCreate={false}
                  label="Apply filters from tags"
                  onChange={applyTagFiltersToCurrentConfig}
                  options={filterTagOptions}
                  tagColors={tagColors}
                  tagDescriptions={tagDescriptions}
                  value={filterPresetTags}
                />
                {filterTagOptions.length === 0 && (
                  <Typography color="text.secondary" variant="caption">
                    No tags have filters JSON yet.
                  </Typography>
                )}
              </Box>
              <Box>
                <CoinFilterConfigDialog config={filterConfig} />
              </Box>
            </Box>

            <CoinThresholdSlider
              key={maximumAvailableLevel}
              maximumLevel={maximumAvailableLevel}
              onCommit={setThreshold}
              value={effectiveThreshold}
            />
            <CoinCandidateFilters
              availableTags={tagOptions}
              config={filterConfig}
              onChange={setFilterConfig}
              tagColors={tagColors}
              tagDescriptions={tagDescriptions}
            />

            <Divider sx={{ my: 1 }} />

            <Typography fontWeight={600} variant="body2" sx={{ mb: 0.5 }}>
              C. Combination
            </Typography>
            <TextField
              fullWidth
              helperText="0 includes all filtered coins"
              label="Coins"
              onChange={(event) => {
                const value = Number(event.target.value);
                setCombinationSize(
                  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
                );
              }}
              size="small"
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              type="number"
              value={combinationSize}
            />


          </Grid>
          <Grid
            size={{
              lg: 6,
              xl: 6,
            }}
          >
            <Typography variant="h6" gutterBottom>Coin Explorer</Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 1 }} />

        <Typography
          fontWeight={600}
          variant="subtitle1"
          sx={{ mt: 2, mb: 0.75 }}
        >
          D. Reports
        </Typography>

        <CoinVolatilityChart
          combinationAnalysis={combinationAnalysis}
          maximumAvailableLevel={maximumAvailableLevel}
          requestedCombinationSize={deferredCombinationSize}
          threshold={effectiveThreshold}
          volatilityMap={selectedVolatilityMap}
        />
        {selectedResults.length > 0 && (
          <HeaderMetrics
            sx={{ mt: 2 }}
            title={
              <Typography fontWeight={600} variant="subtitle1">
                3D Coin Correlation Map
              </Typography>
            }
          >
            {(expanded) =>
              expanded && <CoinCorrelationChart results={selectedResults} />
            }
          </HeaderMetrics>
        )}
        {selectedResults.length > 0 && (
          <HeaderMetrics
            sx={{ mt: 2 }}
            title={
              <Typography fontWeight={600} variant="subtitle1">
                Coin Results Table ({selectedResults.length})
              </Typography>
            }
          >
            {(expanded) =>
              expanded && (
                <CoinResultsTable
                  availableTags={tagOptions}
                  coinDescriptions={tagState.coinDescriptions}
                  coinTags={tagState.coinTags}
                  onCoinDescriptionChange={(symbol, description) =>
                    void updateCoinDescription(symbol, description)
                  }
                  onCoinTagsChange={(symbol, tags) =>
                    void updateCoinTags(symbol, tags)
                  }
                  results={selectedResults}
                  tagColors={tagColors}
                  tagDescriptions={tagDescriptions}
                  volatilityMap={volatilityMap}
                />
              )
            }
          </HeaderMetrics>
        )}

      </Box>
    </Box>
  );
}
