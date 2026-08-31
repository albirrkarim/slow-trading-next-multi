"use client";

import { DEFAULT_COLORS } from "@/components/client/constants";
import CoinMetadataEditor from "@/components/dev/Coins/CoinMetadataEditor";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { SlowTradingDashboardState } from "@/lib/slowTrading";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { green, red } from "@mui/material/colors";
import moment from "moment-timezone";

import DisplayCoinSymbol from "../DisplayCoin";
import ManualEntryDialog from "../ManualEntryDialog";
import { calculateSlowWorkerCapacity } from "../worker-capacity";
import LatestVolatilityPointChartDialog from "./LatestVolatilityPointChartDialog";
import {
  buildMaxEntryVolumeTooltip,
  estimateMaxEntryFromVolume24h,
  formatVolume24h,
  getEstimatedMaxEntryRiskColor,
  getVolume24hRiskColor,
  isLowVolume24h,
} from "./volume";
import { simplifyId, VPOINT_LEVEL_COLOR_MAP } from "./utils";

export default function LatestVolatilityPointCard({
  availableTags,
  canDeleteAnotherCoin,
  coinDescriptions,
  coinTags,
  dashboardState,
  deletingSymbol,
  enteringSymbol,
  index,
  normalizedOpenSymbols,
  onCoinDescriptionChange,
  onCoinTagsChange,
  onDeleteCoin,
  onManualEntry,
  point,
  symbol,
  tagColors,
  tagDescriptions,
  volume24h,
}: {
  availableTags: string[];
  canDeleteAnotherCoin: boolean;
  coinDescriptions: Record<string, string>;
  coinTags: Record<string, string[]>;
  dashboardState: SlowTradingDashboardState;
  deletingSymbol?: string | null;
  enteringSymbol?: string | null;
  index: number;
  normalizedOpenSymbols: Set<string>;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  onDeleteCoin: (symbol: string) => Promise<void>;
  onManualEntry: (symbol: string) => Promise<void>;
  point: VolatilityPoint;
  symbol: string;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  volume24h?: number;
}) {
  const maxEntryBased24HourVolPct =
    dashboardState.config.maxEntryBased24HourVolPct ?? 0.2;
  const estimatedMaxEntry = estimateMaxEntryFromVolume24h({
    maxEntryBased24HourVolPct,
    volume24h,
  });
  const workerCostUsdt = calculateSlowWorkerCapacity(dashboardState).workerCostUsdt;
  const estimatedMaxEntryTooltip = buildMaxEntryVolumeTooltip({
    estimatedMaxEntry,
    maxEntryBased24HourVolPct,
    volume24h,
    workerCostUsdt,
  });
  const lowVolume24h = isLowVolume24h(volume24h);
  const volume24hColor = getVolume24hRiskColor(volume24h);
  const estimatedMaxEntryColor = getEstimatedMaxEntryRiskColor({
    estimatedMaxEntry,
    workerCostUsdt,
  });
  const hasOpenPosition = normalizedOpenSymbols.has(symbol);
  const isSubmitting = enteringSymbol === symbol;
  const isDeleting = deletingSymbol === symbol;
  const deleteDisabled = !canDeleteAnotherCoin || Boolean(deletingSymbol);
  const deleteTitle = !canDeleteAnotherCoin
      ? "The trading config must contain at least one coin"
      : hasOpenPosition
        ? `Remove ${symbol} from new-entry config. Existing open position stays monitored until exit.`
      : `Remove ${symbol} from the trading config`;

  return (
    <Box
      sx={{
        borderRadius: "5px",
        p: 1.5,
        bgcolor: (estimatedMaxEntry ?? 0) < 100 ? red[50] : "background.paper",
        height: "100%",
        borderLeft: `5px solid ${point.l === "B" ? red[500] : green[500]}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Box>
          <DisplayCoinSymbol
            symbol={symbol}
            borderBottom={`5px solid ${DEFAULT_COLORS[index % DEFAULT_COLORS.length]}`}
          />

          <br />

          <Typography
            sx={{
              color: volume24hColor,
              fontWeight: lowVolume24h ? 700 : 400,
            }}
            variant="body2"
          >
            24h Vol: {formatVolume24h(volume24h)}
          </Typography>

          <Tooltip
            title={<Box sx={{ whiteSpace: "pre-line" }}>{estimatedMaxEntryTooltip}</Box>}
          >
            <Typography
              variant="body2"
              component="span"
              sx={{
                color: estimatedMaxEntryColor,
                fontWeight: estimatedMaxEntryColor === "text.secondary" ? 500 : 700,
              }}
              gutterBottom
            >
              Est max entry: {formatVolume24h(estimatedMaxEntry)}
            </Typography>
          </Tooltip>
        </Box>

        <Typography
          variant="body2"
          title={`${moment(point.t).format("DD MMM HH:mm")} Level: ${point.lvl
            } ${simplifyId(point.id)}`}
        >
          {moment(point.t).fromNow()}{" "}
          <span
            style={{
              marginLeft: 10,
              fontWeight: "bold",
              color: VPOINT_LEVEL_COLOR_MAP[Math.abs(point.lvl ?? 0)],
              fontSize: "1.5rem",
            }}
          >
            {point.lvl}
          </span>
        </Typography>
      </Box>

      <Box sx={{ mb: 1 }}>
        <CoinMetadataEditor
          availableTags={availableTags}
          description={coinDescriptions[symbol] ?? ""}
          onDescriptionChange={(description) =>
            onCoinDescriptionChange(symbol, description)
          }
          onTagsChange={(tags) => onCoinTagsChange(symbol, tags)}
          tagColors={tagColors}
          tagDescriptions={tagDescriptions}
          tags={coinTags[symbol] ?? []}
        />
      </Box>

      <HeaderMetrics
        title={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <ManualEntryDialog
              dashboardState={dashboardState}
              disabled={hasOpenPosition}
              point={point}
              submitting={isSubmitting}
              symbol={symbol}
              onConfirm={() => onManualEntry(symbol)}
            />

            <LatestVolatilityPointChartDialog
              dashboardState={dashboardState}
              point={point}
              symbol={symbol}
            />

            <Tooltip title={deleteTitle}>
              <span>
                <IconButton
                  aria-label={`Remove ${symbol} from trading config`}
                  color="error"
                  disabled={deleteDisabled}
                  loading={isDeleting}
                  onClick={() => void onDeleteCoin(symbol)}
                  size="small"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        }
      >
        {(expand) => (
          <>
            {expand && (
              <pre
                style={{
                  fontSize: "12px",
                  margin: 0,
                  overflow: "auto",
                  maxHeight: "200px",
                }}
              >
                {JSON.stringify(point, null, 2)}
              </pre>
            )}
          </>
        )}
      </HeaderMetrics>
    </Box>
  );
}
