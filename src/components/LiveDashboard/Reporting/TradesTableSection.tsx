"use client";

import type { ReactElement } from "react";
import CoinTagChip from "@/components/dev/Coins/CoinTagChip";
import ButtonDialog from "@/components/ui/ButtonDialog";
import CopyToClipboardIconButton from "@/components/ui/CopyToClipboardIconButton";
import { endpoints } from "@/components/endpoints";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Box,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import moment from "moment";
import { useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import TradeChartBase from "@/components/LiveDashboard/Shared/TradeChartBase";
import { NetProfitPercentHistorySparkline } from "@/components/LiveDashboard/Shared/NetProfitPercentHistorySparkline";
import PositionLevelSequence, {
  buildHistoryPositionLevelSequence,
} from "@/components/LiveDashboard/Shared/PositionLevelSequence";
import { EXCHANGE_COLOR_MAP } from "@/components/LiveDashboard/Shared/constants";
import { buildTradeMarkersFromHistory } from "@/components/LiveDashboard/Shared/trade-chart-markers";
import type { ExchangeType } from "@/lib/exchange";
import type {
  SlowTradingDashboardState,
  SlowTradingMode,
} from "@/lib/slowTrading";
import RangedValueText, {
  type RangedValueColorRange,
} from "./RangedValueText";
import type { SlowTradingReportRow } from "./types";
import { formatHoldMs } from "./utils";
import positionData from "@/lib/trading/position";
import TradeHistoryNotesField from "./TradeHistoryNotesField";

type SortKey =
  | "symbol"
  | "entryTime"
  | "entryMarginUSDT"
  | "exitTime"
  | "holdMs"
  | "maxDrawdownPercent"
  | "maxRunUpPercent"
  | "netProfitUSDT";

const metricTooltipSlotProps = {
  tooltip: {
    sx: {
      maxWidth: 420,
      p: 1.1,
      fontSize: "0.8rem",
      lineHeight: 1.45,
    },
  },
};

const TRADE_TIME_FORMAT = "DD MMM YYYY HH:mm";
const TRADE_TIME_SAME_MONTH_FORMAT = "DD MMM HH:mm";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOLD_DURATION_COLOR_RANGES: RangedValueColorRange[] = [
  {
    color: "success.main",
    max: DAY_MS,
  },
  {
    color: "warning.main",
    max: DAY_MS * 2,
    maxInclusive: true,
    min: DAY_MS,
  },
  {
    color: "error.main",
    min: DAY_MS * 2,
    minInclusive: false,
  },
];
const RUN_UP_COLOR_RANGES: RangedValueColorRange[] = [
  {
    color: "error.main",
    max: 1,
  },
  {
    color: "warning.main",
    max: 5,
    min: 1,
  },
  {
    color: "success.main",
    min: 5,
    minInclusive: false,
  },
];
const DRAWDOWN_COLOR_RANGES: RangedValueColorRange[] = [
  {
    color: "error.main",
    max: -5,
    maxInclusive: true,
  },
  {
    color: "warning.main",
    max: -2,
    min: -5,
    minInclusive: false,
  },
  {
    color: "success.main",
    min: -2,
  },
];
const PROFIT_LOSS_COLOR_RANGES: RangedValueColorRange[] = [
  {
    color: "error.main",
    max: 0,
  },
  {
    color: "warning.main",
    max: 0,
    maxInclusive: true,
    min: 0,
  },
  {
    color: "success.main",
    min: 0,
    minInclusive: false,
  },
];

function MetricTooltip({
  children,
  title,
}: {
  children: ReactElement;
  title: string;
}) {
  return (
    <Tooltip
      arrow
      placement="top"
      slotProps={metricTooltipSlotProps}
      title={title}
    >
      {children}
    </Tooltip>
  );
}

export function TradeAuditMessage({ message }: { message?: string }) {
  const normalizedMessage = message?.trim();

  if (!normalizedMessage) {
    return null;
  }

  return (
    <Typography
      component="p"
      variant="caption"
      color="text.secondary"
      sx={{
        m: 0,
        mt: 0.5,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      }}
    >
      {normalizedMessage}
    </Typography>
  );
}

function formatTradeTime({
  compareTimeMs,
  timeMs,
}: {
  compareTimeMs?: number;
  timeMs?: number;
}) {
  if (!timeMs) {
    return "—";
  }

  const tradeMoment = moment(timeMs);

  if (compareTimeMs && tradeMoment.isSame(moment(compareTimeMs), "month")) {
    return tradeMoment.format(TRADE_TIME_SAME_MONTH_FORMAT);
  }

  return tradeMoment.format(TRADE_TIME_FORMAT);
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%`
    : "—";
}

function formatUsdt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value >= 0 ? "+" : ""}${value.toFixed(2)}`
    : "—";
}


/** Gets the entry margin for display, with legacy fallbacks for old rows. */
function getEntryMarginUsdt(row: SlowTradingReportRow) {
  if (typeof row.exposure.marginUsdt === "number" && Number.isFinite(row.exposure.marginUsdt)) {
    return row.exposure.marginUsdt;
  }

  if (
    typeof row.exposure.notionalUsdt === "number" &&
    Number.isFinite(row.exposure.notionalUsdt) &&
    typeof row.exposure.leverage === "number" &&
    Number.isFinite(row.exposure.leverage) &&
    row.exposure.leverage > 0
  ) {
    return row.exposure.notionalUsdt / row.exposure.leverage;
  }

  return typeof row.exposure.notionalUsdt === "number" && Number.isFinite(row.exposure.notionalUsdt)
    ? row.exposure.notionalUsdt
    : 0;
}

function getCoinTagsForSymbol(
  coinTags: Record<string, string[]> | undefined,
  symbol: string | undefined,
) {
  if (!coinTags || !symbol) {
    return [];
  }

  return (
    coinTags[symbol] ??
    coinTags[symbol.toUpperCase()] ??
    coinTags[symbol.toLowerCase()] ??
    []
  );
}

function CoinTagsInline({
  tags,
  tagColors,
  tagDescriptions,
}: {
  tags: string[];
  tagColors?: Record<string, string>;
  tagDescriptions?: Record<string, string>;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
      {tags.map((tag) => {
        const tagKey = tag.toLocaleLowerCase();

        return (
          <CoinTagChip
            key={tag}
            description={tagDescriptions?.[tagKey] ?? ""}
            label={tag}
            size="small"
            tagColor={tagColors?.[tagKey] ?? "#1976d2"}
            sx={{ height: 18, fontSize: "0.62rem" }}
          />
        );
      })}
    </Box>
  );
}

function buildTradeChartPosition(row: SlowTradingReportRow) {
  return row;
}

function TradeChartDialog({
  exchangeType,
  history,
  row,
}: {
  exchangeType: ExchangeType;
  history: SlowTradingReportRow[];
  row: SlowTradingReportRow;
}) {
  return (
    <ButtonDialog
      title="Chart"
      titleLong={`${row.symbol} — Trade Chart`}
      maxWidth="xl"
      customButton={(handleOpen) => (
        <IconButton
          size="small"
          onClick={handleOpen}
          title="View trade chart"
          color="primary"
        >
          <ShowChartIcon fontSize="small" />
        </IconButton>
      )}
    >
      {() => (
        <Box sx={{ p: 1, backgroundColor: "background.default" }}>
          <TradeChartBase
            activePosition={buildTradeChartPosition(row)}
            symbol={row.symbol}
            exchange={exchangeType}
            marketType={
              (row.tradingMode?.toUpperCase() as any) ??
              (exchangeType === "tokocrypto" ? "SPOT" : "FUTURES")
            }
            markers={buildTradeMarkersFromHistory(history, row.symbol)}
            volatilitySource="storage"
            header={
              <>
                <Typography variant="body2">
                  <strong>Entry:</strong> {row.exposure.averageEntryPrice?.toFixed(6)} @{" "}
                  {row.opened.t
                    ? new Date(row.opened.t).toLocaleString()
                    : "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Exit:</strong> {row.closed?.price?.toFixed(6)} @{" "}
                  {row.closed?.t ? new Date(row.closed?.t).toLocaleString() : "—"}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      (row.pnl.netPct ?? 0) >= 0
                        ? "success.main"
                        : "error.main",
                    fontWeight: "bold",
                  }}
                >
                  PnL: {(row.pnl.netPct ?? 0) >= 0 ? "+" : ""}
                  {(row.pnl.netPct ?? 0).toFixed(2)}% ($
                  {(row.pnl.netUsdt ?? 0).toFixed(2)})
                </Typography>
              </>
            }
          />
        </Box>
      )}
    </ButtonDialog>
  );
}

function FeatureCell({ row }: { row: SlowTradingReportRow }) {
  const entryFeature = row.strategy.entry.feature;
  // const decisionMessage =
  //   typeof entryFeature?.decision?.message === "string"
  //     ? entryFeature.decision.message
  //     : typeof row.message === "string"
  //       ? row.message
  //       : null;
  const hasPayload = entryFeature != null;

  return (
    <Box>
      {hasPayload ? (
        <ButtonDialog
          size="small"
          title="Feature"
          titleLong={`Feature: ${row.symbol}`}
          maxWidth="md"
        >
          {() => (
            <Box sx={{ p: 2 }}>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                }}
              >
                {JSON.stringify(entryFeature, null, 2)}
              </Box>
            </Box>
          )}
        </ButtonDialog>
      ) : null}
    </Box>
  );
}

export function TradesTableSection({
  coinTags,
  exchangeType,
  history,
  mode,
  onHistoryChange,
  readOnly = false,
  reserveMultiplier = 2,
  tagColors,
  tagDescriptions,
}: {
  coinTags?: Record<string, string[]>;
  exchangeType: ExchangeType;
  history: SlowTradingReportRow[];
  mode: SlowTradingMode;
  onHistoryChange: (
    nextHistory: SlowTradingDashboardState["history"],
    refreshDashboard?: boolean,
  ) => void;
  readOnly?: boolean;
  reserveMultiplier?: number;
  tagColors?: Record<string, string>;
  tagDescriptions?: Record<string, string>;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("exitTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const safePage = useMemo(() => {
    const maxPage = Math.max(0, Math.ceil(history.length / rowsPerPage) - 1);
    return Math.min(page, maxPage);
  }, [history.length, page, rowsPerPage]);

  const sortedHistory = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    const getSortValue = (row: SlowTradingReportRow): string | number => {
      switch (sortKey) {
        case "symbol":
          return `${row.symbol ?? ""}`.toLowerCase();
        case "entryTime":
          return row.opened.t ?? 0;
        case "entryMarginUSDT":
          return getEntryMarginUsdt(row);
        case "exitTime":
          return row.closed?.t ?? 0;
        case "holdMs":
          return (row.closed?.t ?? 0) - row.opened.t;
        case "maxDrawdownPercent":
          return row.pnl.maxDownPct ?? 0;
        case "maxRunUpPercent":
          return row.pnl.maxUpPct ?? 0;
        case "netProfitUSDT":
          return row.pnl.netUsdt ?? 0;
        default:
          return 0;
      }
    };

    return [...history]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const av = getSortValue(a.row);
        const bv = getSortValue(b.row);
        if (typeof av === "number" && typeof bv === "number") {
          const diff = av - bv;
          if (diff !== 0) return diff * dir;
          return a.index - b.index;
        }
        const cmp = String(av).localeCompare(String(bv));
        if (cmp !== 0) return cmp * dir;
        return a.index - b.index;
      })
      .map((item) => item.row);
  }, [history, sortDirection, sortKey]);

  const pagedHistory = useMemo(() => {
    const start = safePage * rowsPerPage;
    return sortedHistory.slice(start, start + rowsPerPage);
  }, [rowsPerPage, safePage, sortedHistory]);

  const handleRequestSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
    setPage(0);
  };

  const buildRowKey = (row: SlowTradingReportRow, index: number) =>
    `${row.symbol}-${row.opened.t}-${row.closed?.t}-${index}`;

  const handleDeleteRow = async (row: SlowTradingReportRow, rowKey: string) => {
    if (readOnly) return;

    if (
      !confirm(
        `Delete trade history for ${row.symbol} entered at ${row.opened.t ? new Date(row.opened.t).toLocaleString() : "unknown time"}?`,
      )
    ) {
      return;
    }

    setDeletingKey(rowKey);
    try {
      const response = await axios.delete<{
        state?: SlowTradingDashboardState;
      }>(endpoints.slow.prod.history, {
        data: {
          account: row.account,
          mode,
          symbol: row.symbol,
          entryId: row.opened.vPoint.id,
          entryTime: row.opened.t,
          exitTime: row.closed?.t,
          quantity: row.exposure.quantity,
          usdt: row.exposure.notionalUsdt,
        },
      });

      onHistoryChange(response.data.state?.history ?? [], true);
      enqueueSnackbar(`Deleted trade history for ${row.symbol}`, {
        variant: "success",
      });
    } catch (error: any) {
      enqueueSnackbar(
        `Failed to delete ${row.symbol}: ${error.response?.data?.error || error.message}`,
        { variant: "error" },
      );
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Box>
      <TableContainer>
        <Table
          stickyHeader
          size="small"
          sx={{
            "& .MuiTableBody-root .MuiTableCell-root": {
              verticalAlign: "top",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell width={160}>
                <TableSortLabel
                  active={sortKey === "symbol"}
                  direction={sortKey === "symbol" ? sortDirection : "asc"}
                  onClick={() => handleRequestSort("symbol")}
                >
                  Symbol
                </TableSortLabel>
              </TableCell>
              <TableCell width={220}>PNL History</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "entryTime"}
                  direction={sortKey === "entryTime" ? sortDirection : "asc"}
                  onClick={() => handleRequestSort("entryTime")}
                >
                  Entry
                </TableSortLabel>
              </TableCell>
              <TableCell width={130} align="right">
                <TableSortLabel
                  active={sortKey === "entryMarginUSDT"}
                  direction={
                    sortKey === "entryMarginUSDT" ? sortDirection : "asc"
                  }
                  onClick={() => handleRequestSort("entryMarginUSDT")}
                >
                  Margin Entry
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "exitTime"}
                  direction={sortKey === "exitTime" ? sortDirection : "asc"}
                  onClick={() => handleRequestSort("exitTime")}
                >
                  Exit
                </TableSortLabel>
              </TableCell>
              <TableCell width={110}>
                <TableSortLabel
                  active={sortKey === "holdMs"}
                  direction={sortKey === "holdMs" ? sortDirection : "asc"}
                  onClick={() => handleRequestSort("holdMs")}
                >
                  Hold
                </TableSortLabel>
              </TableCell>
              <TableCell width={110} align="center">
                <TableSortLabel
                  active={sortKey === "maxRunUpPercent"}
                  direction={
                    sortKey === "maxRunUpPercent" ? sortDirection : "asc"
                  }
                  onClick={() => handleRequestSort("maxRunUpPercent")}
                >
                  Max Up
                </TableSortLabel>
              </TableCell>
              <TableCell width={110} align="center">
                <TableSortLabel
                  active={sortKey === "maxDrawdownPercent"}
                  direction={
                    sortKey === "maxDrawdownPercent" ? sortDirection : "asc"
                  }
                  onClick={() => handleRequestSort("maxDrawdownPercent")}
                >
                  Max Down
                </TableSortLabel>
              </TableCell>
              <TableCell width={120} align="right">
                <TableSortLabel
                  active={sortKey === "netProfitUSDT"}
                  direction={
                    sortKey === "netProfitUSDT" ? sortDirection : "asc"
                  }
                  onClick={() => handleRequestSort("netProfitUSDT")}
                >
                  PnL Final
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedHistory.map((row, index) => {
              const holdMs =
                (row.closed?.t ?? 0) - row.opened.t;
              const feeUsdt = positionData.fees.totalUsdt(row);
              const pnlPercent = row.pnl.netPct ?? 0;
              const pnlUsdt = row.pnl.netUsdt ?? 0;
              const entryMarginUsdt = getEntryMarginUsdt(row);
              const rowTags = getCoinTagsForSymbol(coinTags, row.symbol);

              return (
                <TableRow key={buildRowKey(row, index)} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      component="div"
                      fontWeight="bold"
                      sx={{
                        borderLeft: `${row.direction === "SHORT" ? "5px solid #f44336" : "5px solid #4caf50"}`,
                        borderBottom: `5px solid ${EXCHANGE_COLOR_MAP[exchangeType] ?? "transparent"}`,
                        px: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                      title={`${row.symbol} ${exchangeType} ${row.direction ?? "LONG"}`}
                      gutterBottom
                    >
                      {row.symbol}
                      {typeof row.exposure.leverage === "number" && row.exposure.leverage > 1 ? (
                        <Chip
                          label={`${row.exposure.leverage}x`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: "0.6rem",
                            bgcolor: "rgba(0,0,0,0.05)",
                          }}
                        />
                      ) : null}
                    </Typography>

                    <Typography
                      color="text.secondary"
                      display="block"
                      variant="caption"
                    >
                      Account: {row.account}
                    </Typography>

                    <CoinTagsInline
                      tagColors={tagColors}
                      tagDescriptions={tagDescriptions}
                      tags={rowTags}
                    />
                    {/* <Chip label={row.tradingMode} size="small" variant="outlined" /> */}
                  </TableCell>
                  <TableCell
                    aria-label={`PnL history and level sequence for ${row.symbol}`}
                  >
                    <NetProfitPercentHistorySparkline
                      history={row.pnl.history ?? []}
                      exitTimeMs={row.closed?.t}
                    />
                    <Box sx={{ mt: 0.75, maxWidth: 220 }}>
                      {/* BOTH:REUSABLE_LEVEL_SEQUENCE */}
                      <PositionLevelSequence
                        items={buildHistoryPositionLevelSequence(row)}
                        reserveMultiplier={reserveMultiplier}
                        showTargetAlert={false}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" gutterBottom>
                      {formatTradeTime({
                        compareTimeMs: row.closed?.t,
                        timeMs: row.opened.t,
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {row.exposure.averageEntryPrice ? `$${row.exposure.averageEntryPrice.toFixed(6)}` : "—"}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {positionData.entry.label(row)}
                    </Typography>
                    <TradeAuditMessage message={row.opened.message} />
                  </TableCell>
                  <TableCell align="right">
                    <MetricTooltip title="Entry margin assigned to the position in USDT.">
                      <Typography
                        component="span"
                        variant="body1"
                        sx={{ cursor: "help" }}
                      >
                        {entryMarginUsdt > 0
                          ? `$${entryMarginUsdt.toFixed(2)}`
                          : "—"}
                      </Typography>
                    </MetricTooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" gutterBottom>
                      {formatTradeTime({
                        compareTimeMs: row.opened.t,
                        timeMs: row.closed?.t,
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {row.closed?.price ? `$${row.closed?.price.toFixed(6)}` : "—"}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      {positionData.close.label(row)}
                    </Typography>
                    <TradeAuditMessage message={row.closed?.message} />
                    {!readOnly && (
                      <TradeHistoryNotesField
                        mode={mode}
                        onHistoryChange={onHistoryChange}
                        readOnly={false}
                        row={row}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <RangedValueText
                      formatValue={formatHoldMs}
                      ranges={HOLD_DURATION_COLOR_RANGES}
                      value={holdMs}
                      variant="body1"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <MetricTooltip title="Maximum run-up seen while this trade was open. It comes from position.pnl.maxUpPct, calculated from position.pnl.history observations.">
                      <RangedValueText
                        component="span"
                        fallbackColor="text.secondary"
                        formatValue={formatPercent}
                        ranges={RUN_UP_COLOR_RANGES}
                        value={row.pnl.maxUpPct}
                        variant="body1"
                      />
                    </MetricTooltip>
                  </TableCell>
                  <TableCell align="center">
                    <MetricTooltip title="Maximum drawdown seen while this trade was open. It comes from position.pnl.maxDownPct, calculated as the worst position.pnl.history observation.">
                      <RangedValueText
                        component="span"
                        fallbackColor="text.secondary"
                        formatValue={formatPercent}
                        ranges={DRAWDOWN_COLOR_RANGES}
                        value={row.pnl.maxDownPct}
                        variant="body1"
                      />
                    </MetricTooltip>
                  </TableCell>
                  <TableCell align="right">
                    <MetricTooltip title="position.pnl.netUsdt. Final closed-trade profit/loss in USDT after round-trip fees. On futures this is calculated from the leveraged position size, so it can be larger than margin-only movement.">
                      <RangedValueText
                        component="div"
                        fallbackColor="text.secondary"
                        fontWeight="bold"
                        formatValue={formatUsdt}
                        ranges={PROFIT_LOSS_COLOR_RANGES}
                        sx={{ cursor: "help" }}
                        value={pnlUsdt}
                        variant="body2"
                      />
                    </MetricTooltip>

                    <MetricTooltip title="position.pnl.netPct. Final closed-trade return percent after round-trip fees. This is unlevered and price-based: entry price to exit price, adjusted by fees. The USDT value is then derived from position size.">
                      <RangedValueText
                        component="div"
                        fallbackColor="text.secondary"
                        formatValue={formatPercent}
                        ranges={PROFIT_LOSS_COLOR_RANGES}
                        sx={{ cursor: "help" }}
                        value={pnlPercent}
                        variant="body2"
                      />
                    </MetricTooltip>

                    <MetricTooltip title="position.fees.entryUsdt + position.closed.feeUsdt. Closed trades record realized total fee in USDT. Historical rows can show 0 when the old record did not contain fees.">
                      <Typography
                        variant="caption"
                        component="div"
                        color="text.secondary"
                        sx={{ fontWeight: 600, cursor: "help" }}
                      >
                        Fee: ${feeUsdt.toFixed(2)}
                      </Typography>
                    </MetricTooltip>
                  </TableCell>
                  <TableCell align="right">
                    {!readOnly && (
                      <IconButton
                        size="small"
                        color="error"
                        title={`Delete trade history for ${row.symbol}`}
                        disabled={deletingKey === buildRowKey(row, index)}
                        onClick={() => {
                          void handleDeleteRow(row, buildRowKey(row, index));
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                    <TradeChartDialog
                      exchangeType={exchangeType}
                      history={history}
                      row={row}
                    />
                    <ButtonDialog
                      size="small"
                      sx={{ my: 1 }}
                      title="JSON"
                      titleLong={`Trade Detail: ${row.symbol}`}
                      maxWidth="md"
                    >
                      {() => (
                        <Box sx={{ p: 2 }}>
                          <CopyToClipboardIconButton
                            color="inherit"
                            size="small"
                            tooltipTitle="Copy JSON"
                            aria-label="Copy trade JSON"
                            text={JSON.stringify(row, null, 2)}
                          />
                          <Box
                            component="pre"
                            sx={{
                              m: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontSize: "0.75rem",
                            }}
                          >
                            {JSON.stringify(row, null, 2)}
                          </Box>
                        </Box>
                      )}
                    </ButtonDialog>

                    <FeatureCell row={row} />
                  </TableCell>
                </TableRow>
              );
            })}

            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 4 }}
                  >
                    No slow-trading history available yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={history.length}
        page={safePage}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </Box>
  );
}
