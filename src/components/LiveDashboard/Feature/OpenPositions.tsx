"use client";

import type { DynamicTradeConfig, VolatilityPoint } from "@/lib/dynamic";
import type { SlowTradingHistoryPosition, SlowTradingMode } from "@/lib/slowTrading";

import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import HeaderMetrics from "@/components/ui/HeaderMetrics";
import openPositionPnlContribution from "./open-position-pnl-contribution";
import OpenPositionItem from "./OpenPositionItem";

interface OpenPositionsProps {
  availableTags: string[];
  coinDescriptions: Record<string, string>;
  coinTags: Record<string, string[]>;
  config: DynamicTradeConfig;
  mode: SlowTradingMode;
  exchangeType: DynamicTradeConfig["exchangeType"];
  positions: SlowTradingHistoryPosition[];
  spendableQuoteAsset: number;
  exitingSymbol?: string | null;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  onExit?: (symbol: string) => Promise<void>;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  volatilityMap: Record<string, VolatilityPoint[]>;
  volume24hBySymbol: Record<string, number>;
}

type PnlSortOrder = "best" | "worst";

/** Gets the dashboard volatility points for a position symbol. */
function getPositionVolatilityPoints(
  volatilityMap: Record<string, VolatilityPoint[]>,
  symbol: string,
) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const points =
    volatilityMap[symbol] ??
    volatilityMap[normalizedSymbol] ??
    Object.entries(volatilityMap).find(
      ([key]) => key.trim().toUpperCase() === normalizedSymbol,
    )?.[1];

  return points ?? [];
}

/** Returns a stable copy of the positions ordered by current PnL percentage. */
function sortPositionsByPnl(
  positions: SlowTradingHistoryPosition[],
  order: PnlSortOrder,
) {
  const direction = order === "worst" ? 1 : -1;

  return positions
    .map((position, index) => ({ index, position }))
    .sort((a, b) => {
      const aPnl = Number.isFinite(a.position.pnl.netPct)
        ? (a.position.pnl.netPct ?? 0)
        : 0;
      const bPnl = Number.isFinite(b.position.pnl.netPct)
        ? (b.position.pnl.netPct ?? 0)
        : 0;
      const pnlOrder = (aPnl - bPnl) * direction;
      return pnlOrder === 0 ? a.index - b.index : pnlOrder;
    })
    .map(({ position }) => position);
}

export default function OpenPositions({
  availableTags,
  coinDescriptions,
  coinTags,
  config,
  mode,
  exchangeType,
  positions,
  spendableQuoteAsset,
  exitingSymbol,
  onCoinDescriptionChange,
  onCoinTagsChange,
  onExit,
  tagColors,
  tagDescriptions,
  volatilityMap,
  volume24hBySymbol,
}: OpenPositionsProps) {
  const [pnlSortOrder, setPnlSortOrder] = useState<PnlSortOrder>("worst");
  const sortedPositions = useMemo(
    () => sortPositionsByPnl(positions, pnlSortOrder),
    [pnlSortOrder, positions],
  );
  const totalAbsolutePnlUsdt = useMemo(
    () => openPositionPnlContribution.totalAbsolute(positions),
    [positions],
  );
  const isWorstFirst = pnlSortOrder === "worst";

  return (
    <HeaderMetrics
      defaultExpanded
      title={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
            Open Positions ({positions.length})
          </Typography>
          <Tooltip
            arrow
            placement="top"
            title={`PnL: ${isWorstFirst ? "worst" : "best"} first`}
          >
            <IconButton
              aria-label={`Sort PnL ${isWorstFirst ? "best" : "worst"} first`}
              color={isWorstFirst ? "error" : "success"}
              onClick={() =>
                setPnlSortOrder((current) =>
                  current === "worst" ? "best" : "worst",
                )
              }
              size="small"
            >
              {isWorstFirst ? (
                <ArrowUpwardRoundedIcon fontSize="small" />
              ) : (
                <ArrowDownwardRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip
            arrow
            placement="top"
            title="Each position stores its latest successful monitoring stage, timestamp, and classification reason. Speedup defaults to 1 minute; Standard Monitoring defaults to 5 minutes."
          >
            <HelpOutlineIcon
              color="action"
              fontSize="small"
              sx={{ cursor: "help" }}
            />
          </Tooltip>
        </Box>
      }
      titleRight={
        <Chip
          label={mode.toUpperCase()}
          size="small"
          color={mode === "sandbox" ? "warning" : "success"}
          variant="outlined"
        />
      }
    >
      {(expanded) =>
        expanded && (
          <Box sx={{ overflowY: "auto", maxHeight: "600px", mt: 1 }}>
            <Stack spacing={1}>
              {sortedPositions.map((position, index) => {
                const volatilityPoints = getPositionVolatilityPoints(
                  volatilityMap,
                  position.symbol,
                );

                return (
                  <OpenPositionItem
                    key={`${position.symbol}-${position.opened.t ?? index}`}
                    availableTags={availableTags}
                    coinDescription={coinDescriptions[position.symbol] ?? ""}
                    coinTags={coinTags[position.symbol] ?? []}
                    config={config}
                    currentVolatilityLevel={volatilityPoints.at(-1)?.lvl}
                    exchangeType={exchangeType}
                    pnlContributionShare={openPositionPnlContribution.share(
                      position.pnl.netUsdt ?? 0,
                      totalAbsolutePnlUsdt,
                    )}
                    position={position}
                    spendableQuoteAsset={spendableQuoteAsset}
                    exitingSymbol={exitingSymbol}
                    onCoinDescriptionChange={onCoinDescriptionChange}
                    onCoinTagsChange={onCoinTagsChange}
                    onExit={onExit}
                    tagColors={tagColors}
                    tagDescriptions={tagDescriptions}
                    volatilityPoints={volatilityPoints}
                    volume24h={
                      volume24hBySymbol[
                        String(position.symbol || "")
                          .trim()
                          .toUpperCase()
                      ]
                    }
                  />
                );
              })}

              {positions.length === 0 && (
                <Box
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    color: "text.secondary",
                    p: 2,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="body2">No open positions</Typography>
                </Box>
              )}
            </Stack>
          </Box>
        )
      }
    </HeaderMetrics>
  );
}
