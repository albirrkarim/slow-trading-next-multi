"use client";

import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Box,
  FormHelperText,
  Grid,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";

import CoinMultiSelect from "@/components/ui/CoinMultiSelect";
import IconButtonTooltip from "@/components/ui/IconButtonTooltip";
import { DESCISION_MODELS } from "@/lib/dynamic/constants-clients";
import type { ExchangeType, TradingMode } from "@/lib/exchange/types";

import ExchangeAccountManagerDialog, {
  getExchangeAccountOptionLabel,
} from "./ExchangeAccountManagerDialog";
import { parseSymbols } from "./helpers";
import SettingsGroup from "./SettingsGroup";
import SettingsInfoField from "./SettingsInfoField";
import SafeHavenScheduleSettings from "./SafeHavenScheduleSettings";
import type { ConfigDraft, ConfigDraftSetter } from "./types";

const TRADING_MODE_OPTIONS: Array<{ value: TradingMode; label: string }> = [
  { value: "spot" as TradingMode, label: "Spot" },
  { value: "futures" as TradingMode, label: "Futures (Margin Isolated)" },
];

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Formats an exact USD input as a compact, readable market-cap preview. */
function formatMarketCapPreview(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Preview: Disabled";
  }

  const unit =
    amount >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: "B" }
      : amount >= 1_000_000
        ? { divisor: 1_000_000, suffix: "M" }
        : null;
  if (!unit) {
    return `Preview: USD ${amount.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}`;
  }

  const compactAmount = amount / unit.divisor;
  const maximumFractionDigits = compactAmount >= 100 ? 0 : 2;
  return `Preview: USD ${compactAmount.toLocaleString("en-US", {
    maximumFractionDigits,
  })}${unit.suffix}`;
}

export default function SettingsDialogManagementTab({
  configDraft,
  setConfigDraft,
}: {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
}) {
  const updateModelConfig = (patch: Partial<typeof configDraft.modelConfig>) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            modelConfig: {
              ...prev.modelConfig,
              ...patch,
            },
          }
        : prev,
    );
  };

  return (
    <Stack gap={3}>
      <SettingsGroup title="Main">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack gap={1}>
              <SettingsInfoField
                fullWidth
                info="Display name for this slow-trading profile in the dashboard and stored config."
                label="Name"
                onChange={(event) =>
                  setConfigDraft((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev,
                  )
                }
                size="small"
                value={configDraft.name}
              />
              <SettingsInfoField
                fullWidth
                info="Optional notes about the strategy intent, risk style, or purpose of this profile."
                label="Description"
                maxRows={8}
                minRows={4}
                multiline
                onChange={(event) =>
                  setConfigDraft((prev) =>
                    prev ? { ...prev, description: event.target.value } : prev,
                  )
                }
                size="small"
                value={configDraft.description}
              />
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Stack gap={1}>
              <Stack alignItems="center" direction="row" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <SettingsInfoField
                    fullWidth
                    info="Select which configured exchange account slow trading should use for private balance checks and live orders."
                    label="Exchange Account"
                    onChange={(event) => {
                      const accountId = event.target.value;
                      const account = configDraft.exchangeAccounts.find(
                        (item) => item.id === accountId,
                      );
                      setConfigDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              exchangeAccountId: accountId,
                              exchangeType: account?.type ?? prev.exchangeType,
                            }
                          : prev,
                      );
                    }}
                    select
                    size="small"
                    value={String(configDraft.exchangeAccountId)}
                  >
                    {configDraft.exchangeAccounts.map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {getExchangeAccountOptionLabel(account)}
                      </MenuItem>
                    ))}
                  </SettingsInfoField>
                </Box>
                <ExchangeAccountManagerDialog
                  configDraft={configDraft}
                  setConfigDraft={setConfigDraft}
                />
              </Stack>

              <SettingsInfoField
                fullWidth
                info="Defines which adapter and market data source slow trading will use."
                label="Exchange Type"
                onChange={(event) => {
                  const exchangeType = event.target.value as ExchangeType;
                  setConfigDraft((prev) => {
                    if (!prev) {
                      return prev;
                    }

                    const matchingAccount = prev.exchangeAccounts.find(
                      (account) => account.type === exchangeType,
                    );

                    return {
                      ...prev,
                      exchangeAccountId:
                        matchingAccount?.id ?? prev.exchangeAccountId,
                      exchangeType,
                    };
                  });
                }}
                select
                size="small"
                value={configDraft.exchangeType}
              >
                <MenuItem value="tokocrypto">Tokocrypto</MenuItem>
                <MenuItem value="okx">OKX</MenuItem>
                <MenuItem value="binance">Binance</MenuItem>
              </SettingsInfoField>

              <SettingsInfoField
                fullWidth
                info="Controls whether entries behave like spot, margin, or futures."
                label="Trading Mode"
                onChange={(event) =>
                  setConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          tradingMode: event.target.value as TradingMode,
                        }
                      : prev,
                  )
                }
                select
                size="small"
                value={configDraft.tradingMode}
              >
                {TRADING_MODE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </SettingsInfoField>

              <SettingsInfoField
                fullWidth
                info="This controls the recommendation engine used when slow trading generates entry signals."
                label="Decision Engine"
                onChange={(event) =>
                  setConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          decisionEngineVersion: event.target.value,
                        }
                      : prev,
                  )
                }
                select
                size="small"
                value={configDraft.decisionEngineVersion}
              >
                {DESCISION_MODELS.map((item) => (
                  <MenuItem
                    key={item.value}
                    title={item.descrption}
                    value={item.value}
                  >
                    {item.name}
                  </MenuItem>
                ))}
              </SettingsInfoField>
            </Stack>
          </Grid>
        </Grid>
      </SettingsGroup>

      <SettingsGroup
        description="Choose which coins SLOW may trade and when a coin should be retired from new entries. Removing a coin from Symbols does not interrupt management of an existing position."
        title="Coin Management"
      >
        <CoinMultiSelect
          label="Symbols"
          onChange={(symbols) =>
            setConfigDraft((prev) =>
              prev ? { ...prev, symbolsText: symbols.join(", ") } : prev,
            )
          }
          value={parseSymbols(configDraft.symbolsText)}
        />

        <Stack alignItems="center" direction="row" spacing={0.5} sx={{ pt: 0.5 }}>
          <Typography fontWeight={700} variant="body2">
            Auto Remove
          </Typography>
          <IconButtonTooltip
            size="small"
            sx={{ color: "text.secondary", p: 0.25 }}
            tooltipTitle="Automatic removal runs on the independently configurable Management Cycle in live and sandbox. A matching coin is removed from Symbols even when it has an open position; that position remains managed until it closes. Set a rule to 0 to disable it."
          >
            <HelpOutlineIcon fontSize="inherit" />
          </IconButtonTooltip>
        </Stack>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <SettingsInfoField
              fullWidth
              info="Auto-removal based on volatility level in live and sandbox. Example: value 6 removes a coin from Symbols when its latest vpoint reaches level +6 or -6. Existing positions remain managed. Set 0 to disable."
              label="Based on Abs Level"
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        autoRemoveSymbolAbsLevel: Math.max(
                          0,
                          Math.floor(Number(event.target.value) || 0),
                        ),
                      }
                    : prev,
                )
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "numeric",
                  min: 0,
                  step: "1",
                },
              }}
              type="number"
              value={configDraft.autoRemoveSymbolAbsLevel ?? 0}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <SettingsInfoField
              fullWidth
              info="Minimum market price in USDT. Live and sandbox remove a coin from Symbols when its latest valid price is strictly below this value. Existing positions remain managed, while new entries are blocked below the value. Set 0 to disable."
              label="Based on Price (USDT)"
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        autoRemoveSymbolMinPrice: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      }
                    : prev,
                )
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  min: 0,
                  step: "any",
                },
              }}
              type="number"
              value={configDraft.autoRemoveSymbolMinPrice ?? 0}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <SettingsInfoField
              fullWidth
              info="Minimum market cap in USD. Live and sandbox remove a coin from Symbols when its latest available market cap is strictly below this value. Existing positions remain managed. Market-cap data is cached for 24 hours. Set 0 to disable."
              label="Based on Market Cap (USD)"
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        autoRemoveSymbolMinMarketCapUSD: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      }
                    : prev,
                )
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "numeric",
                  min: 0,
                  step: "1",
                },
              }}
              type="number"
              value={configDraft.autoRemoveSymbolMinMarketCapUSD ?? 0}
            />
            {/* PROD:AUTO_REMOVE_MARKET_CAP_INPUT_PREVIEW */}
            <FormHelperText
              sx={{
                fontVariantNumeric: "tabular-nums",
                ml: 1.75,
                mt: 0.5,
              }}
            >
              {formatMarketCapPreview(
                configDraft.autoRemoveSymbolMinMarketCapUSD,
              )}
            </FormHelperText>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <SettingsInfoField
              fullWidth
              info="Scans every vPoint in each coin's complete persisted volatility history. Live and sandbox remove a coin when any vPoint movement is greater than or equal to this percentage. TOP and BOTTOM pct values are both positive movement magnitudes. Default 15%. Set 0 to disable."
              label="Based on Any vPoint (%)"
              onChange={(event) =>
                setConfigDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        autoRemoveSymbolMinVPointPct: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      }
                    : prev,
                )
              }
              size="small"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  min: 0,
                  step: "any",
                },
              }}
              type="number"
              value={configDraft.autoRemoveSymbolMinVPointPct ?? 15}
            />
          </Grid>
        </Grid>
      </SettingsGroup>

      <SettingsGroup
        info="Safe Haven is SLOW's virtual protected USDT reserve. Each enabled schedule can create one queue item per UTC month, allowing several reserve dates in the same month. Due occurrences are picked up on the next active runner pass."
        title="Safe Haven"
      >
        <SafeHavenScheduleSettings
          autoEnabled={configDraft.safeHavenAutoEnabled ?? false}
          schedules={configDraft.safeHavenSchedules ?? []}
          setConfigDraft={setConfigDraft}
        />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <SettingsInfoField
              fullWidth
              info="Minimum capital that should remain available for trading. Example: value 600 means SLOW avoids moving extra funds into Safe Haven when trading capital would fall below 600 USDT."
              label="Minimal Asset On Trade"
              onChange={(event) =>
                updateModelConfig({
                  minimalAssetOnTrade: parseNumber(event.target.value),
                })
              }
              size="small"
              type="number"
              value={configDraft.modelConfig.minimalAssetOnTrade ?? 0}
            />
          </Grid>
        </Grid>
      </SettingsGroup>
    </Stack>
  );
}
