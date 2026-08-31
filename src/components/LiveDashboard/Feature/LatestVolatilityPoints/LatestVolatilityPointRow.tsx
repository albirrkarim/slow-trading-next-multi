"use client";

import { DEFAULT_COLORS } from "@/components/client/constants";
import CoinTagSelect from "@/components/dev/Coins/CoinTagSelect";
import ButtonDialog from "@/components/ui/ButtonDialog";
import VPointLevelFrequency from "@/components/ui/VPointLevelFrequency";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { UnifiedFundingRate } from "@/lib/exchange";
import type {
  SlowEntrySequenceCount,
  SlowTradingDashboardState,
} from "@/lib/slowTrading";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Box,
  IconButton,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { green, orange, red } from "@mui/material/colors";
import moment from "moment-timezone";

import DisplayCoinSymbol from "../DisplayCoin";
import ManualEntryDialog from "../ManualEntryDialog";
import { calculateSlowWorkerCapacity } from "../worker-capacity";
import LatestVolatilityPointChartDialog from "./LatestVolatilityPointChartDialog";
import type { VolatilityPointLabelFrequency } from "./types";
import { simplifyId, VPOINT_LEVEL_COLOR_MAP } from "./utils";
import VolatilityPointLabelFrequencyBar from "./VolatilityPointLabelFrequencyBar";
import FundingRateCell from "./FundingRateCell";
import {
  buildMaxEntryVolumeTooltip,
  estimateMaxEntryFromVolume24h,
  formatVolume24h,
  getEstimatedMaxEntryRiskColor,
  getVolume24hRiskColor,
  isLowVolume24h,
} from "./volume";

function formatLatestPointPrice(price: number) {
  if (!Number.isFinite(price)) return "-";

  if (price >= 1_000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function getPriceRiskColor(price: number) {
  if (price < 1) return red[600];
  if (price < 5) return orange[700];
  return undefined;
}

function getEntrySequenceRiskColor(total: number) {
  if (total < 2) return red[600];
  if (total < 4) return orange[700];
  return undefined;
}

function getFrequencyRiskColor(total: number) {
  if (total < 20) return red[600];
  if (total < 50) return orange[700];
  return undefined;
}

function getMarketCapRiskColor(value: number | undefined) {
  if (value === undefined) return red[600];
  if (value < 25_000_000) return red[600];
  if (value < 100_000_000) return orange[700];
  return undefined;
}

function formatMarketCapUSD(value: number | undefined) {
  if (value === undefined) return "-";

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    notation: "compact",
    style: "currency",
  }).format(value);
}

/** Formats the market-cap cache timestamp for its compact secondary label. */
export function formatMarketCapUpdatedAt(value: number | undefined) {
  // PROD:MARKET_CAP_UPDATED_AT
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Updated: unknown";
  }

  return `Updated ${moment(value).format("DD MMM YYYY HH:mm")}`;
}

export default function LatestVolatilityPointRow({
  availableTags,
  canDeleteAnotherCoin,
  coinDescriptions,
  coinTags,
  dashboardState,
  deletingSymbol,
  entrySequenceCount,
  enteringSymbol,
  fundingRate,
  index,
  labelFrequency,
  levelFrequency,
  marketCapFetchedAt,
  marketCapUSD,
  normalizedOpenSymbols,
  onCoinDescriptionChange,
  onCoinTagsChange,
  onDeleteCoin,
  onManualEntry,
  point,
  pointCount,
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
  entrySequenceCount: SlowEntrySequenceCount;
  enteringSymbol?: string | null;
  fundingRate?: UnifiedFundingRate;
  index: number;
  labelFrequency: VolatilityPointLabelFrequency;
  levelFrequency: Record<string, number>;
  marketCapFetchedAt?: number;
  marketCapUSD?: number;
  normalizedOpenSymbols: Set<string>;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  onDeleteCoin: (symbol: string) => Promise<void>;
  onManualEntry: (symbol: string) => Promise<void>;
  point: VolatilityPoint;
  pointCount: number;
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
  const levelColor = VPOINT_LEVEL_COLOR_MAP[Math.abs(point.lvl ?? 0)];
  const entrySequenceColor = getEntrySequenceRiskColor(
    entrySequenceCount.total,
  );
  const frequencyColor = getFrequencyRiskColor(pointCount);
  const marketCapColor = getMarketCapRiskColor(marketCapUSD);
  const priceColor = getPriceRiskColor(point.p);
  const railColor = point.l === "B" ? red[500] : green[500];

  return (
    <TableRow
      hover
      sx={{
        bgcolor: (estimatedMaxEntry ?? 0) < 100 ? red[50] : undefined,
        "& > td:first-of-type": {
          borderLeft: `5px solid ${railColor}`,
        },
      }}
    >
      <TableCell sx={{ minWidth: 210, verticalAlign: "top" }}>
        <DisplayCoinSymbol
          symbol={symbol}
          borderBottom={`5px solid ${DEFAULT_COLORS[index % DEFAULT_COLORS.length]}`}
        />

        <CoinTagSelect
          onChange={(tags) => onCoinTagsChange(symbol, tags)}
          options={availableTags}
          tagColors={tagColors}
          tagDescriptions={tagDescriptions}
          value={coinTags[symbol] ?? []}
        />
      </TableCell>

      <TableCell sx={{ minWidth: 130, verticalAlign: "top" }}>
        <Tooltip
          title={`Latest volatility point price at ${moment(point.t).format(
            "DD MMM HH:mm",
          )}`}
        >
          <Typography
            component="span"
            sx={{ color: priceColor, fontWeight: 700 }}
            variant="h6"
          >
            ${formatLatestPointPrice(point.p)}
          </Typography>
        </Tooltip>
      </TableCell>

      <TableCell sx={{ minWidth: 130, verticalAlign: "top" }}>
        <Typography color={marketCapColor} fontWeight={700} variant="h6">
          {formatMarketCapUSD(marketCapUSD)}
        </Typography>
        <Typography color="text.secondary" display="block" variant="caption">
          {formatMarketCapUpdatedAt(marketCapFetchedAt)}
        </Typography>
      </TableCell>

      <FundingRateCell fundingRate={fundingRate} />

      <TableCell sx={{ minWidth: 150, verticalAlign: "top" }}>
        <Typography color={entrySequenceColor} fontWeight={700} variant="h6">
          {entrySequenceCount.total.toLocaleString()}
        </Typography>
        <Typography color="text.secondary" variant="caption">
          LONG {entrySequenceCount.long.toLocaleString()}, SHORT{" "}
          {entrySequenceCount.short.toLocaleString()}
        </Typography>
      </TableCell>

      <TableCell sx={{ minWidth: 190, verticalAlign: "top" }}>
        <Typography color={frequencyColor} fontWeight={700} variant="h6">
          {pointCount.toLocaleString()}
        </Typography>
        <VolatilityPointLabelFrequencyBar frequency={labelFrequency} />
        <VPointLevelFrequency frequency={levelFrequency} />
      </TableCell>

      <TableCell sx={{ minWidth: 320, verticalAlign: "top" }}>
        <TextField
          defaultValue={coinDescriptions[symbol] ?? ""}
          fullWidth
          minRows={2}
          multiline
          onBlur={(event) => {
            const normalized = event.target.value.trim();
            if (normalized !== coinDescriptions[symbol])
              onCoinDescriptionChange(symbol, normalized);
          }}
          sx={{ my: 2 }}
          variant="standard"
          placeholder="Notes"
          size="small"
          slotProps={{ htmlInput: { maxLength: 1_000 } }}
        />
      </TableCell>

      <TableCell>
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
          title={
            <Box sx={{ whiteSpace: "pre-line" }}>
              {estimatedMaxEntryTooltip}
            </Box>
          }
        >
          <Typography
            component="span"
            sx={{
              color: estimatedMaxEntryColor,
              fontWeight: estimatedMaxEntryColor === "text.secondary" ? 500 : 700,
            }}
            variant="body2"
          >
            Est max entry: {formatVolume24h(estimatedMaxEntry)}
          </Typography>
        </Tooltip>
      </TableCell>

      <TableCell>
        <Typography
          component="span"
          sx={{
            color: levelColor,
            fontSize: "1.5rem",
            fontWeight: "bold",
            lineHeight: 1,
          }}
        >
          {point.lvl}
        </Typography>
        <Tooltip
          title={`${moment(point.t).format("DD MMM HH:mm")} Level: ${point.lvl
            } ${simplifyId(point.id)}`}
        >
          <Typography variant="body2">
            {moment(point.t).fromNow()}
          </Typography>
        </Tooltip>
      </TableCell>

      <TableCell>
        <ManualEntryDialog
          dashboardState={dashboardState}
          disabled={hasOpenPosition}
          onConfirm={() => onManualEntry(symbol)}
          point={point}
          submitting={isSubmitting}
          symbol={symbol}
        />

        <Box sx={{ my: 1 }}>
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

        <ButtonDialog title="JSON" size="small" variant="outlined">
          {(_handleClose) => (
            <pre
              style={{
                fontSize: "12px",
                margin: 0,
                maxHeight: "200px",
                overflow: "auto",
              }}
            >
              {JSON.stringify(point, null, 2)}
            </pre>
          )}
        </ButtonDialog>
      </TableCell>
    </TableRow>
  );
}
