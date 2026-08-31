"use client";

import type { ReactElement } from "react";
import CoinTagSelect from "@/components/dev/Coins/CoinTagSelect";
import ButtonDialog from "@/components/ui/ButtonDialog";
import CopyToClipboardIconButton from "@/components/ui/CopyToClipboardIconButton";
import HeaderMetrics from "@/components/ui/HeaderMetrics";
import { EXCHANGE_COLOR_MAP } from "@/components/LiveDashboard/Shared/constants";
import { NetProfitPercentHistorySparkline } from "@/components/LiveDashboard/Shared/NetProfitPercentHistorySparkline";
import type { DynamicTradeConfig, VolatilityPoint } from "@/lib/dynamic";
import type { SlowTradingHistoryPosition } from "@/lib/slowTrading";
import moment from "moment-timezone";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SpeedIcon from "@mui/icons-material/Speed";
import TradeChartBase from "@/components/LiveDashboard/Shared/TradeChartBase";

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { green, red } from "@mui/material/colors";
import { alpha } from "@mui/material/styles";
import {
  buildMaxEntryVolumeTooltip,
  estimateMaxEntryFromVolume24h,
  formatVolume24h,
  simplifyId,
} from "./LatestVolatilityPoints";
import OpenPositionLevelSequence from "./OpenPositionLevelSequence";
import OpenPositionFundingRate from "./OpenPositionFundingRate";
import openPositionDuration from "./open-position-duration";
import openPositionPnlContribution from "./open-position-pnl-contribution";
import positionData from "@/lib/trading/position";
import DisplayCoinSymbol from "./DisplayCoin";

interface OpenPositionItemProps {
  availableTags: string[];
  coinDescription: string;
  coinTags: string[];
  config: DynamicTradeConfig;
  currentVolatilityLevel?: number;
  exchangeType: DynamicTradeConfig["exchangeType"];
  pnlContributionShare: number;
  position: SlowTradingHistoryPosition;
  spendableQuoteAsset: number;
  exitingSymbol?: string | null;
  onCoinDescriptionChange: (symbol: string, description: string) => void;
  onCoinTagsChange: (symbol: string, tags: string[]) => void;
  onExit?: (position: SlowTradingHistoryPosition) => Promise<void>;
  tagColors: Record<string, string>;
  tagDescriptions: Record<string, string>;
  volatilityPoints: VolatilityPoint[];
  volume24h?: number;
}

function formatPrice(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return value < 1 ? value.toFixed(4) : value.toFixed(2);
}

function formatNumber(value?: number, digits = 4) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function formatUsdt(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return value.toFixed(2);
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Builds the CoinGlass pair heatmap URL for a dashboard position symbol. */
function getCoinGlassLiquidationMapUrl(symbol: string) {
  const coin = symbol
    .trim()
    .toUpperCase()
    .replace(/[-/_]?(?:USDT|USDC)$/u, "");

  return `https://www.coinglass.com/pro/futures/LiquidationHeatMapNew?coin=${encodeURIComponent(coin)}&type=pair`;
}

function DisplayRunUp({ num }: { num?: number }) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize: "inherit",
      }}
      color={(num ?? 0) >= 0 ? "success.main" : "text.primary"}
    >
      {formatPercent(num)}
    </Typography>
  );
}

function DisplayDrawdown({ num }: { num?: number }) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize: "inherit",
      }}
      color={(num ?? 0) < 0 ? "error.main" : "text.primary"}
    >
      {formatPercent(num)}
    </Typography>
  );
}

function formatDate(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

const tooltipSlotProps = {
  tooltip: {
    sx: {
      maxWidth: 360,
      p: 1,
      fontSize: "0.78rem",
      lineHeight: 1.4,
    },
  },
};

function MetricTooltip({
  children,
  title,
}: {
  children: ReactElement;
  title: string;
}) {
  return (
    <Tooltip arrow placement="top" slotProps={tooltipSlotProps} title={title}>
      {children}
    </Tooltip>
  );
}

export default function OpenPositionItem({
  availableTags,
  coinDescription,
  coinTags,
  config,
  currentVolatilityLevel,
  exchangeType,
  pnlContributionShare,
  position,
  spendableQuoteAsset,
  exitingSymbol,
  onCoinDescriptionChange,
  onCoinTagsChange,
  onExit,
  tagColors,
  tagDescriptions,
  volatilityPoints,
  volume24h,
}: OpenPositionItemProps) {
  const profitPercent = position.pnl.netPct ?? 0;
  const lastMonitoringStage = position.lastMonitoringStage;
  const isSpeedupStage = lastMonitoringStage?.stage === "speedup";
  const profitUsdt = position.pnl.netUsdt ?? 0;
  const contributionOpacity =
    openPositionPnlContribution.opacity(pnlContributionShare);
  const contributionColor = profitUsdt >= 0 ? green[600] : red[600];
  const contributionGradient =
    contributionOpacity > 0
      ? `radial-gradient(circle at 100% 100%, ${alpha(
        contributionColor,
        contributionOpacity,
      )} 0%, ${alpha(
        contributionColor,
        contributionOpacity * 0.55,
      )} 30%, transparent 70%)`
      : "none";
  const runUp = position.pnl.maxUpPct ?? 0;
  const drawdown = position.pnl.maxDownPct ?? 0;
  const maxEntryBased24HourVolPct = config.maxEntryBased24HourVolPct ?? 0.2;
  const estimatedMaxEntry = estimateMaxEntryFromVolume24h({
    maxEntryBased24HourVolPct,
    volume24h,
  });
  const maxEntryTooltip = buildMaxEntryVolumeTooltip({
    estimatedMaxEntry,
    maxEntryBased24HourVolPct,
    volume24h,
  });
  const borderColor =
    EXCHANGE_COLOR_MAP[exchangeType] ?? EXCHANGE_COLOR_MAP.tokocrypto;

  return (
    <HeaderMetrics
      headerSx={{
        backgroundImage: contributionGradient,
        p: 1,
      }}
      sx={{
        mb: 0,
        borderColor: "divider",
        borderLeft: `5px solid ${position.direction === "SHORT" ? red[500] : green[500]}`,
        bgcolor: "background.paper",
      }}
      title={
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            width: "100%",
          }}
        >
          <Box
            sx={{
              alignItems: "center",
              display: "flex",
              flex: "1 1 360px",
              flexWrap: "wrap",
              gap: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: "bold",
                fontSize: "0.9rem",
                borderBottom: `5px solid ${borderColor}`,
              }}
            >
              {position.symbol}
            </Typography>

            <Chip
              label={position.account}
              size="small"
              variant="outlined"
            />

            {isSpeedupStage && (
              // PROD:SPEEDUP_STAGE
              <MetricTooltip
                title={`Speedup monitoring stage: ${lastMonitoringStage.reason}. Last updated: ${formatDate(lastMonitoringStage.lastUpdated)}`}
              >
                <Chip
                  aria-label="Speedup monitoring stage"
                  color="warning"
                  icon={<SpeedIcon />}
                  label=""
                  size="small"
                  sx={{
                    height: 18,
                    width: 24,
                    "& .MuiChip-icon": { margin: 0 },
                    "& .MuiChip-label": { display: "none" },
                  }}
                />
              </MetricTooltip>
            )}

            {(position.exposure.leverage ?? 1) > 1 && (
              <MetricTooltip title="Leverage multiplier used by this futures position. Size equals margin multiplied by leverage.">
                <Chip
                  label={`${position.exposure.leverage}x`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: "0.6rem",
                    bgcolor: "rgba(0,0,0,0.05)",
                  }}
                />
              </MetricTooltip>
            )}

            {position.exposure.marginUsdt && (
              <MetricTooltip title="Margin locked for this position in USDT. On futures this is smaller than Size because leverage is applied.">
                <Chip
                  label={formatUsdt(position.exposure.marginUsdt)}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: "0.6rem",
                    bgcolor: "rgba(0,0,0,0.05)",
                  }}
                />
              </MetricTooltip>
            )}

            <OpenPositionLevelSequence
              currentLevel={currentVolatilityLevel}
              direction={position.direction}
              entryLevel={position.opened.vPoint.lvl}
              entryTime={position.opened.t}
              markPrice={position.pnl.markPrice}
              reserveMultiplier={config.watchReservePctAlloc ?? 2}
              spendableQuoteAsset={spendableQuoteAsset}
              volatilityPoints={volatilityPoints}
              watchState={position.strategy.averaging}
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: { xs: 1, md: 2 },
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              marginLeft: "auto",
            }}
          >
            <MetricTooltip
              title={
                position.opened.t
                  ? `Open for ${openPositionDuration.format(position.opened.t)}`
                  : "Open duration unavailable"
              }
            >
              <Typography
                color={
                  position.opened.t &&
                    openPositionDuration.isOlderThanDays(position.opened.t, 1)
                    ? "warning.main"
                    : undefined
                }
                variant="body2"
              >
                {position.opened.t ? moment(position.opened.t).fromNow() : "-"}
              </Typography>
            </MetricTooltip>

            <MetricTooltip
              title={`position.pnl.netUsdt. Floating gross price PnL minus estimated round-trip fees. On futures it is calculated on leveraged size, not only margin. Portfolio contribution: ${(
                pnlContributionShare * 100
              ).toFixed(1)}% of total absolute open-position PnL.`}
            >
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: "bold",
                    color: profitUsdt >= 0 ? "success.main" : "error.main",
                  }}
                >
                  $ {formatUsdt(profitUsdt)}
                </Typography>
              </Box>
            </MetricTooltip>

            <MetricTooltip title="position.pnl.netPct. Floating price move after estimated round-trip fee percent. For futures this percent is the price move, while USDT PnL is amplified by leverage through position size.">
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    color: profitPercent >= 0 ? "success.main" : "error.main",
                  }}
                >
                  {formatPercent(profitPercent)}
                </Typography>
              </Box>
            </MetricTooltip>

            <MetricTooltip title="Max run-up observed for this open position from position.pnl.history. It uses the same fee-aware floating PnL observations.">
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="body2"
                  sx={{ fontSize: "0.75rem!important", fontWeight: "bold" }}
                >
                  UP <DisplayRunUp num={runUp} />
                </Typography>
              </Box>
            </MetricTooltip>

            <MetricTooltip title="Max drawdown observed for this open position from position.pnl.history. It is the worst fee-aware floating PnL percent seen so far.">
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="body2"
                  sx={{ fontSize: "0.75rem!important", fontWeight: "bold" }}
                >
                  DD <DisplayDrawdown num={drawdown} />
                </Typography>
              </Box>
            </MetricTooltip>
          </Box>
        </Box>
      }
    >
      {(expanded) =>
        expanded ? (
          <Box sx={{ px: 1, pt: 1, pb: 1.5 }}>
            <DisplayCoinSymbol
              symbol={position.symbol}
              onlyLink
            />

            <Box sx={{ mt: 1 }}>
              <NetProfitPercentHistorySparkline
                history={position.pnl.history ?? []}
              />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  sm: "repeat(3, minmax(0, 1fr))",
                  md: "repeat(5, minmax(0, 1fr))",
                },
                gap: 1.5,
                mt: 1.5,
                mb: 1.5,
              }}
            >
              <MetricTooltip title="Quantity of the base asset or futures contract size held by this position.">
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem", display: "block" }}
                  >
                    Quantity
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {formatNumber(position.exposure.quantity, 6)}
                  </Typography>
                </Box>
              </MetricTooltip>

              <MetricTooltip title="position.exposure.notionalUsdt. SPOT: quote value. FUTURES: leveraged notional size, usually margin multiplied by leverage.">
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem", display: "block" }}
                  >
                    Size (USDT)
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {formatUsdt(position.exposure.notionalUsdt)}
                  </Typography>
                </Box>
              </MetricTooltip>

              {position.exposure.leverage && position.exposure.leverage > 1 ? (
                <>
                  <MetricTooltip title="Futures leverage multiplier used to derive size from margin.">
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: "0.7rem", display: "block" }}
                      >
                        Lev
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                      >
                        {position.exposure.leverage}x
                      </Typography>
                    </Box>
                  </MetricTooltip>

                  <MetricTooltip title="position.exposure.marginUsdt. Wallet capital locked for this futures position.">
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: "0.7rem", display: "block" }}
                      >
                        Margin (USDT)
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                      >
                        {formatUsdt(position.exposure.marginUsdt ?? 0)}
                      </Typography>
                    </Box>
                  </MetricTooltip>
                </>
              ) : null}

              <MetricTooltip title="position.fees. Open positions show paid entry fee plus estimated exit fee. Closed positions show realized entry plus exit fees.">
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem", display: "block" }}
                  >
                    Fee (USDT)
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {formatUsdt(positionData.fees.totalUsdt(position))}
                  </Typography>
                </Box>
              </MetricTooltip>

              <MetricTooltip title="Latest known 24h quote volume for this coin from the dashboard ticker snapshot.">
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem", display: "block" }}
                  >
                    24h Vol
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {formatVolume24h(volume24h)}
                  </Typography>
                </Box>
              </MetricTooltip>

              <MetricTooltip title={maxEntryTooltip}>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem", display: "block" }}
                  >
                    Max Entry
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                  >
                    {formatVolume24h(estimatedMaxEntry)}
                  </Typography>
                </Box>
              </MetricTooltip>
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md:
                    position.tradingMode === "futures"
                      ? "repeat(6, minmax(0, 1fr))"
                      : "repeat(5, minmax(0, 1fr))",
                },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block" }}
                >
                  Entry Price
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                >
                  {formatPrice(position.exposure.averageEntryPrice)}
                </Typography>
              </Box>

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block" }}
                >
                  Mark Price
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                >
                  {formatPrice(position.pnl.markPrice)}
                </Typography>
              </Box>

              {position.tradingMode === "futures" && (
                <OpenPositionFundingRate
                  direction={position.direction}
                  funding={position.funding}
                />
              )}

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block" }}
                >
                  Trade Mode
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                >
                  {position.tradingMode}
                </Typography>
              </Box>

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block" }}
                >
                  Entered At (Jakarta)
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                >
                  {formatDate(position.opened.t)}
                </Typography>
              </Box>


              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block" }}
                >
                  Entry ID
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", fontSize: "0.85rem" }}
                >
                  {simplifyId(position.opened.vPoint.id ?? "")}
                </Typography>
              </Box>


            </Box>

            <Box
              sx={{
                alignItems: "flex-start",
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(220px, 0.85fr) minmax(280px, 1.5fr)",
                },
                mb: 1.5,
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block", mb: 0.25 }}
                >
                  Tags
                </Typography>
                <CoinTagSelect
                  label=""
                  onChange={(tags) => onCoinTagsChange(position.symbol, tags)}
                  options={availableTags}
                  tagColors={tagColors}
                  tagDescriptions={tagDescriptions}
                  value={coinTags}
                />
              </Box>

              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem", display: "block", mb: 0.25 }}
                >
                  Description
                </Typography>
                <TextField
                  defaultValue={coinDescription}
                  fullWidth
                  minRows={2}
                  multiline
                  onBlur={(event) => {
                    const normalized = event.target.value.trim();
                    if (normalized !== coinDescription) {
                      onCoinDescriptionChange(position.symbol, normalized);
                    }
                  }}
                  placeholder="Notes"
                  size="small"
                  slotProps={{ htmlInput: { maxLength: 1_000 } }}
                  variant="standard"
                />
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                variant="outlined"
                size="small"
                color="error"
                sx={{ fontSize: "0.7rem", textTransform: "none" }}
                onClick={() => void onExit?.(position)}
                disabled={!onExit || exitingSymbol === position.symbol}
                title={`Click to close position for ${position.symbol}`}
              >
                {exitingSymbol === position.symbol ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  "Close Position"
                )}
              </Button>

              <ButtonDialog
                title="View Chart"
                titleLong={`${position.symbol} — Trade Chart`}
                maxWidth="xl"
                size="small"
                variant="outlined"
                customButton={(handleOpen) => (
                  <Button
                    variant="outlined"
                    size="small"
                    color="primary"
                    sx={{ fontSize: "0.7rem", textTransform: "none" }}
                    onClick={handleOpen}
                    title={`View chart for ${position.symbol}`}
                    startIcon={<ShowChartIcon fontSize="small" />}
                  >
                    View Chart
                  </Button>
                )}
              >
                {() => (
                  <Box sx={{ p: 1, backgroundColor: "background.default" }}>
                    <TradeChartBase
                      activePosition={position}
                      symbol={position.symbol}
                      exchange={exchangeType}
                      marketType={
                        (position.tradingMode?.toUpperCase() as any) ??
                        (exchangeType === "tokocrypto" ? "SPOT" : "FUTURES")
                      }
                      markers={[]}
                      volatilitySource="storage"
                      header={
                        <>
                          <Typography variant="body2">
                            <strong>Entry:</strong>{" "}
                            {position.exposure.averageEntryPrice?.toFixed(6)} @{" "}
                            {position.opened.t
                              ? new Date(position.opened.t).toLocaleString()
                              : "—"}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              color:
                                (position.pnl.netPct ?? 0) >= 0
                                  ? "success.main"
                                  : "error.main",
                              fontWeight: "bold",
                            }}
                          >
                            PnL:{" "}
                            {(position.pnl.netPct ?? 0) >= 0 ? "+" : ""}
                            {(position.pnl.netPct ?? 0).toFixed(2)}% ($
                            {(position.pnl.netUsdt ?? 0).toFixed(2)})
                          </Typography>
                        </>
                      }
                    />
                  </Box>
                )}
              </ButtonDialog>

              <Button
                component="a"
                href={getCoinGlassLiquidationMapUrl(position.symbol)}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="small"
                color="secondary"
                sx={{ fontSize: "0.7rem", textTransform: "none" }}
                title={`Open the CoinGlass liquidation heatmap for ${position.symbol} in a new tab`}
                startIcon={<OpenInNewIcon fontSize="small" />}
              >
                Liquidation Map
              </Button>

              <ButtonDialog
                title="JSON"
                titleLong={`Position JSON: ${position.symbol}`}
                maxWidth="md"
                size="small"
                variant="outlined"
              >
                {() => (
                  <Box sx={{ p: 2 }}>
                    <CopyToClipboardIconButton
                      color="inherit"
                      size="small"
                      tooltipTitle="Copy JSON"
                      aria-label="Copy position JSON"
                      text={JSON.stringify(position, null, 2)}
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
                      {JSON.stringify(position, null, 2)}
                    </Box>
                  </Box>
                )}
              </ButtonDialog>
            </Box>

          </Box>
        ) : null
      }
    </HeaderMetrics>
  );
}
