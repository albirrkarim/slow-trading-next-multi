"use client";

import { COLORS_BG, DEFAULT_COLORS } from "@/components/client/constants";
import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import { Box, Checkbox, FormControlLabel } from "@mui/material";
import moment from "moment";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildMergedData } from "./utils";
import CustomTooltip from "./CustomTooltip";
import ChartLines from "./ChartLines";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface VolatilityMultiLineProps {
  series: LeveledMarkers[][];
  names?: string[];
  colors?: string[];
  height?: number;
  defaultShowEntryGroups?: boolean;
  yTickFormatter?: (value: unknown) => string;
}

function MultiLineTimelined({
  series,
  names = [],
  colors = COLORS_BG,
  height = 420,
  defaultShowEntryGroups = false,
  yTickFormatter,
}: VolatilityMultiLineProps) {
  const { data, textMaps } = useMemo(() => buildMergedData(series), [series]);
  const xAxisDateFormat = useMemo(() => {
    const times = data
      .map((item) => Number(item.timeMs))
      .filter((time) => Number.isFinite(time));
    if (times.length < 2) return "DD MMM";
    return Math.max(...times) - Math.min(...times) < ONE_YEAR_MS
      ? "DD MMM"
      : "DD MMM YY";
  }, [data]);
  const formatXAxisTick = useCallback(
    (value: unknown) => moment.utc(Number(value)).format(xAxisDateFormat),
    [xAxisDateFormat],
  );

  const dataColors = useMemo(
    () =>
      series.map(
        (item, idx) =>
          item[0]?.color ?? item[1]?.color ?? colors[idx % colors.length]
      ),
    [series, colors]
  );

  const dataColorsMain = useMemo(
    () =>
      series.map(
        (item, idx) =>
          item[0]?.color ?? item[1]?.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
      ),
    [series]
  );

  const dataKeys = useMemo(() => series.map((_, i) => `s${i}`), [series]);
  const seriesNames = useMemo(
    () => series.map((_, i) => names[i] ?? `Series ${i + 1}`),
    [series, names]
  );

  const isTradeGroupDefaultVisible = useCallback(
    (group: string) =>
      group === "TRADE SIMULATION" ||
      (defaultShowEntryGroups && group.startsWith("ENTRY ")),
    [defaultShowEntryGroups],
  );

  /** 🔹 Find unique TRADE groups (TRADE SUI, TRADE BTC, etc.) */
  const tradeGroups = useMemo(() => {
    const trades = new Set<string>();
    for (const n of seriesNames) {
      if (n.startsWith("TRADE ")) {
        const parts = n.split(" ");
        if (parts.length >= 2) trades.add(`${parts[0]} ${parts[1]}`);
      }
      if (n.startsWith("ENTRY ")) {
        const parts = n.split(" ");
        if (parts.length >= 2) trades.add(`${parts[0]} ${parts[1]}`);
      }
    }
    return Array.from(trades);
  }, [seriesNames]);

  /** 🔹 State management */
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(series.map((_, i) => `s${i}`))
  );
  const [showTradeGroup, setShowTradeGroup] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        tradeGroups.map((group) => [
          group,
          isTradeGroupDefaultVisible(group),
        ]),
      ),
  );

  const effectiveShowTradeGroup = useMemo(
    () => ({
      ...Object.fromEntries(
        tradeGroups.map((group) => [
          group,
          isTradeGroupDefaultVisible(group),
        ]),
      ),
      ...showTradeGroup,
    }),
    [isTradeGroupDefaultVisible, showTradeGroup, tradeGroups],
  );

  /** Reset visibility when series changes */
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(new Set(series.map((_, i) => `s${i}`)));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [series]);

  /** Toggle visibility of individual line */
  const toggle = useCallback((key: string) => {
    startTransition(() => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    });
  }, []);

  /** Isolate a line */
  const isolate = useCallback((key: string) => {
    startTransition(() => {
      setVisible(new Set([key]));
    });
  }, []);

  /** ✅ Memoized Legend Component */
  const LegendContent = useCallback(
    () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, zIndex: "0!important" }}>
        {/* TRADE group toggles */}
        {tradeGroups.length > 0 && (
          <div
            style={{
              alignItems: "center",
              columnGap: 10,
              display: "flex",
              flexWrap: "wrap",
              rowGap: 2,
            }}
          >
            {tradeGroups.map((g) => (
              <FormControlLabel
                key={g}
                sx={{
                  m: 0,
                  minHeight: 26,
                  "& .MuiFormControlLabel-label": {
                    fontSize: 12,
                    lineHeight: 1.2,
                  },
                }}
                control={
                  <Checkbox
                    checked={effectiveShowTradeGroup[g] ?? false}
                    onChange={(e) =>
                      startTransition(() =>
                        setShowTradeGroup((prev) => ({
                          ...prev,
                          [g]: e.target.checked,
                        }))
                      )
                    }
                    size="small"
                    sx={{
                      p: 0.375,
                      mr: 0.25,
                      "& .MuiSvgIcon-root": { fontSize: 16 },
                    }}
                  />
                }
                label={g}
              />
            ))}
          </div>
        )}

        {/* Normal legend items */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {dataKeys.map((key, idx) => {
            const name = seriesNames[idx];
            const color = dataColors[idx % dataColors.length];
            const isVisible = visible.has(key);
            if (!name) return null;

            // Skip TRADE items from normal legend (they’re handled by group toggles)
            if (name.startsWith("TRADE ")) return null;

            if (name.startsWith("ENTRY ")) return null;

            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                onDoubleClick={() => isolate(key)}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  opacity: isVisible ? 1 : 0.35,
                  userSelect: "none",
                }}
                title={
                  isVisible
                    ? `Hide ${name} (double-click to isolate)`
                    : `Show ${name}`
                }
              >
                <div
                  style={{
                    width: 12,
                    height: 8,
                    background: color,
                    borderRadius: 2,
                  }}
                />
                <div style={{ fontSize: 13 }}>{name}</div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    [
      tradeGroups,
      effectiveShowTradeGroup,
      visible,
      dataKeys,
      seriesNames,
      dataColors,
      toggle,
      isolate,
    ]
  );

  /** ✅ Render */
  return (
    <Box sx={{ width: "100%", height, py: 1 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timeMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={formatXAxisTick}
            minTickGap={10}
            allowDataOverflow={false}
          />
          <YAxis tickFormatter={yTickFormatter} />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...(props as any)}
                textMaps={textMaps}
                names={seriesNames}
              />
            )}
          />

          <Legend content={LegendContent} />

          <ChartLines
            dataColors={dataColors}
            dataColorsMain={dataColorsMain}
            dataKeys={dataKeys}
            seriesNames={seriesNames}
            visible={visible}
            showTradeGroup={effectiveShowTradeGroup}
          />

          <Brush
            dataKey="timeMs"
            height={30}
            stroke="#8884d8"
            tickFormatter={formatXAxisTick}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export default React.memo(MultiLineTimelined);
