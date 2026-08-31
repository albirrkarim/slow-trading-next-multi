"use client";

import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import GroupIcon from "@mui/icons-material/Group";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";

import { endpoints } from "@/components/endpoints";
import ButtonDialog from "@/components/ui/ButtonDialog";
import IconButtonTooltip from "@/components/ui/IconButtonTooltip";
import type { ExchangeAccountType } from "@/lib/exchange/account-context";
import type { SlowTradingAccount } from "@/lib/slowTrading";
import type { ConfigDraft, ConfigDraftSetter } from "./types";
import SettingsInfoField from "./SettingsInfoField";
import { tradeLog } from "@/lib/trading/helper/log";
import { applyAccountProfileToConfigDraft } from "./helpers";

function maskCredentialValue(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getExchangeAccountTypeLabel(
  type: ExchangeAccountType,
): string {
  return type === "binance" ? "Binance" : type;
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "account";
}

function CredentialSettingsField({
  info,
  label,
  onBlur,
  onChange,
  revealed,
  setRevealed,
  value,
}: {
  info: string;
  label: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  revealed: boolean;
  setRevealed: (revealed: boolean) => void;
  value: string;
}) {
  const editable = revealed || value.length === 0;

  return (
    <TextField
      label={label}
      size="small"
      fullWidth
      value={editable ? value : maskCredentialValue(value)}
      onFocus={() => {
        if (!revealed && value.length === 0) {
          setRevealed(true);
        }
      }}
      onChange={(event) => {
        if (editable) {
          if (!revealed) {
            setRevealed(true);
          }
          onChange(event.target.value);
        }
      }}
      onBlur={onBlur}
      slotProps={{
        input: {
          readOnly: !editable,
          endAdornment: (
            <InputAdornment position="end">
              <IconButtonTooltip
                edge="end"
                size="small"
                onClick={() => setRevealed(!revealed)}
                tooltipTitle={revealed ? "Hide value" : "Show value"}
              >
                {revealed ? (
                  <VisibilityOffIcon fontSize="inherit" />
                ) : (
                  <VisibilityIcon fontSize="inherit" />
                )}
              </IconButtonTooltip>
              <IconButtonTooltip
                edge="end"
                size="small"
                sx={{ color: "text.secondary" }}
                tooltipTitle={info}
              >
                <HelpOutlineIcon fontSize="inherit" />
              </IconButtonTooltip>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

interface ExchangeAccountManagerDialogProps {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
}

export default function ExchangeAccountManagerDialog({
  configDraft,
  setConfigDraft,
}: ExchangeAccountManagerDialogProps) {
  const [editingExchangeAccountSlug, setEditingExchangeAccountSlug] = useState(
    configDraft.exchangeAccountSlug,
  );
  const [revealedCredentials, setRevealedCredentials] = useState({
    accountId: "",
    apiKey: false,
    apiSecret: false,
    passphrase: false,
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const effectiveEditingAccountId = configDraft.exchangeAccounts.some(
    (account) => account.slug === editingExchangeAccountSlug,
  )
    ? editingExchangeAccountSlug
    : (configDraft.exchangeAccounts.find(
        (account) => account.slug === configDraft.exchangeAccountSlug,
      )?.slug ??
      configDraft.exchangeAccounts[0]?.slug ??
      configDraft.exchangeAccountSlug);
  const editingExchangeAccount =
    configDraft.exchangeAccounts.find(
      (account) => account.slug === effectiveEditingAccountId,
    ) ?? configDraft.exchangeAccounts[0];
  const currentRevealedCredentials =
    revealedCredentials.accountId === effectiveEditingAccountId
      ? revealedCredentials
      : {
          accountId: effectiveEditingAccountId,
          apiKey: false,
          apiSecret: false,
          passphrase: false,
        };

  const setCredentialRevealed = (
    key: "apiKey" | "apiSecret" | "passphrase",
    revealed: boolean,
  ) => {
    setRevealedCredentials((prev) => ({
      accountId: effectiveEditingAccountId,
      apiKey:
        prev.accountId === effectiveEditingAccountId ? prev.apiKey : false,
      apiSecret:
        prev.accountId === effectiveEditingAccountId ? prev.apiSecret : false,
      passphrase:
        prev.accountId === effectiveEditingAccountId ? prev.passphrase : false,
      [key]: revealed,
    }));
  };

  const persistExchangeAccounts = async (
    accounts: SlowTradingAccount[],
    exchangeAccountSlug: string,
  ) => {
    setSaveStatus("saving");
    try {
      const response = await axios.put<{
        accounts: SlowTradingAccount[];
        exchangeAccountSlug: string;
      }>(endpoints.slow.prod.exchangeAccounts, {
        accounts,
        exchangeAccountSlug,
      });
      const savedAccounts = Array.isArray(response.data?.accounts)
        ? response.data.accounts
        : accounts;
      const savedExchangeAccountSlug =
        typeof response.data?.exchangeAccountSlug === "string"
          ? response.data.exchangeAccountSlug
          : exchangeAccountSlug;
      setConfigDraft((prev) =>
        prev
          ? {
              ...prev,
              exchangeAccounts: savedAccounts,
              exchangeAccountSlug: savedExchangeAccountSlug,
            }
          : prev,
      );
      setEditingExchangeAccountSlug((current) =>
        savedAccounts.some((account) => account.slug === current)
          ? current
          : (savedAccounts.at(-1)?.slug ?? savedExchangeAccountSlug),
      );
      setSaveStatus("saved");
    } catch (error) {
      tradeLog.error("Failed to save exchange accounts", error);
      setSaveStatus("error");
    }
  };

  const applyAccountDraftUpdate = (
    updater: (draft: ConfigDraft) => ConfigDraft,
    options: { persist?: boolean } = {},
  ) => {
    let nextDraft: ConfigDraft | null = null;
    setConfigDraft((prev) => {
      if (!prev) {
        return prev;
      }
      nextDraft = updater(prev);
      return nextDraft;
    });

    const draftToSave = nextDraft as ConfigDraft | null;
    if (!options.persist) {
      setSaveStatus("idle");
      return;
    }

    if (draftToSave) {
      void persistExchangeAccounts(
        draftToSave.exchangeAccounts,
        draftToSave.exchangeAccountSlug,
      );
    }
  };

  const persistAccountDraft = () => {
    applyAccountDraftUpdate((draft) => draft, { persist: true });
  };

  const updateExchangeAccount = (
    accountId: string,
    updater: (account: SlowTradingAccount) => SlowTradingAccount,
  ) => {
    applyAccountDraftUpdate((prev) => {
      let selectedAccount: SlowTradingAccount | undefined;
      const exchangeAccounts = prev.exchangeAccounts.map((account) => {
        if (account.slug !== accountId) {
          return account;
        }

        const nextAccount = updater(account);
        if (prev.exchangeAccountSlug === accountId) {
          selectedAccount = nextAccount;
        }
        return nextAccount;
      });

      return {
        ...prev,
        exchangeAccounts,
        exchangeType: selectedAccount?.type ?? prev.exchangeType,
      };
    });
  };

  const createExchangeAccountSlug = () => {
    const name = `Binance ${configDraft.exchangeAccounts.length + 1}`;
    const base = slugFromName(name);
    const usedSlugs = new Set(
      configDraft.exchangeAccounts.map((account) => account.slug),
    );
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  };

  const addExchangeAccount = () => {
    const now = Date.now();
    const template =
      configDraft.exchangeAccounts.find(
        (candidate) => candidate.slug === configDraft.exchangeAccountSlug,
      ) ?? configDraft.exchangeAccounts[0];
    if (!template) return;
    const account: SlowTradingAccount = {
      slug: createExchangeAccountSlug(),
      type: "binance",
      name: `Binance ${configDraft.exchangeAccounts.length + 1}`,
      description: "",
      credentials: { apiKey: "", apiSecret: "" },
      enabled: true,
      trading: structuredClone(template.trading),
      sandbox: {
        enabled: false,
        initialBalanceUSDT: template.sandbox.initialBalanceUSDT,
      },
      createdAt: now,
      updatedAt: now,
    };

    applyAccountDraftUpdate(
      (prev) => ({
        ...prev,
        exchangeAccounts: [...prev.exchangeAccounts, account],
      }),
      { persist: true },
    );
    setEditingExchangeAccountSlug(account.slug);
  };

  const deleteEditingExchangeAccount = () => {
    if (!editingExchangeAccount || configDraft.exchangeAccounts.length <= 1) {
      return;
    }

    applyAccountDraftUpdate(
      (prev) => {
        const exchangeAccounts = prev.exchangeAccounts.filter(
          (account) => account.slug !== editingExchangeAccount.slug,
        );
        const exchangeAccountSlug =
          prev.exchangeAccountSlug === editingExchangeAccount.slug
            ? (exchangeAccounts[0]?.slug ?? prev.exchangeAccountSlug)
            : prev.exchangeAccountSlug;
        const selectedAccount = exchangeAccounts.find(
          (account) => account.slug === exchangeAccountSlug,
        );

        const nextDraft = {
          ...prev,
          exchangeAccountSlug,
          exchangeAccounts,
          exchangeType: selectedAccount?.type ?? prev.exchangeType,
        };
        return selectedAccount && prev.exchangeAccountSlug !== exchangeAccountSlug
          ? applyAccountProfileToConfigDraft(nextDraft, selectedAccount)
          : nextDraft;
      },
      { persist: true },
    );
    setEditingExchangeAccountSlug(
      configDraft.exchangeAccounts.find(
        (account) => account.slug !== editingExchangeAccount.slug,
      )?.slug ?? configDraft.exchangeAccountSlug,
    );
  };

  return (
    <ButtonDialog
      maxWidth="md"
      size="small"
      title="Accounts"
      titleLong="Exchange Accounts"
      variant="outlined"
      customButton={(handleOpen) => (
        <IconButton
          aria-label="Manage exchange accounts"
          onClick={handleOpen}
          size="small"
          title="Manage exchange accounts"
          sx={{
            alignSelf: "stretch",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            height: 40,
            width: 40,
          }}
        >
          <GroupIcon fontSize="small" />
        </IconButton>
      )}
    >
      {() => (
        <Stack gap={2}>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                Saved Accounts
              </Typography>
              <Typography color="text.secondary" variant="caption">
                Choose a profile here only to edit its name, credentials, and
                entry status. Every enabled account runs independently.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              {saveStatus !== "idle" && (
                <Typography
                  color={saveStatus === "error" ? "error" : "text.secondary"}
                  variant="caption"
                >
                  {saveStatus === "saving"
                    ? "Saving..."
                    : saveStatus === "saved"
                      ? "Saved"
                      : "Save failed"}
                </Typography>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addExchangeAccount}
              >
                Add
              </Button>
              <Button
                color="error"
                disabled={configDraft.exchangeAccounts.length <= 1}
                size="small"
                variant="outlined"
                startIcon={<DeleteOutlineIcon />}
                onClick={deleteEditingExchangeAccount}
              >
                Delete
              </Button>
            </Stack>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack gap={1}>
                {configDraft.exchangeAccounts.map((account) => {
                  const selected = account.slug === editingExchangeAccount?.slug;
                  return (
                    <Button
                      key={account.slug}
                      variant={selected ? "contained" : "outlined"}
                      color={selected ? "primary" : "inherit"}
                      onClick={() => setEditingExchangeAccountSlug(account.slug)}
                      sx={{
                        justifyContent: "space-between",
                        minHeight: 44,
                        textAlign: "left",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          component="span"
                          display="block"
                          fontWeight={700}
                          noWrap
                          variant="body2"
                        >
                          {account.name || account.slug}
                        </Typography>
                        <Typography
                          component="span"
                          display="block"
                          noWrap
                          sx={{
                            color: selected
                              ? "primary.contrastText"
                              : "text.secondary",
                          }}
                          variant="caption"
                        >
                          {getExchangeAccountTypeLabel(account.type)}
                        </Typography>
                        {account.description && (
                          <Typography
                            component="span"
                            display="block"
                            noWrap
                            sx={{
                              color: selected
                                ? "primary.contrastText"
                                : "text.secondary",
                              opacity: selected ? 0.82 : 1,
                            }}
                            variant="caption"
                          >
                            {account.description}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        color={account.enabled ? "success" : "default"}
                        label={account.enabled ? "Entries on" : "Entries off"}
                        size="small"
                        variant={selected ? "filled" : "outlined"}
                      />
                    </Button>
                  );
                })}
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 8 }}>
              {editingExchangeAccount && (
                <Stack gap={1.5}>
                  <Grid container spacing={1.25}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <SettingsInfoField
                        label="Account Name"
                        size="small"
                        fullWidth
                        value={editingExchangeAccount.name}
                        onBlur={persistAccountDraft}
                        onChange={(event) =>
                          updateExchangeAccount(
                            editingExchangeAccount.slug,
                            (account) => ({
                              ...account,
                              name: event.target.value,
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                        info="Label shown in the dashboard so you can recognize the exchange account."
                      />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                      <SettingsInfoField
                        label="Account Type"
                        size="small"
                        fullWidth
                        value="Binance"
                        slotProps={{ input: { readOnly: true } }}
                        info="All SLOW accounts use the shared Binance exchange adapter."
                      />
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={editingExchangeAccount.enabled}
                            onChange={(event) => {
                              updateExchangeAccount(
                                editingExchangeAccount.slug,
                                (account) => ({
                                  ...account,
                                  enabled: event.target.checked,
                                  updatedAt: Date.now(),
                                }),
                              );
                            }}
                            onBlur={persistAccountDraft}
                          />
                        }
                        label="Enable new entries for this account"
                      />
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <SettingsInfoField
                        label="Description"
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                        maxRows={4}
                        value={editingExchangeAccount.description}
                        onBlur={persistAccountDraft}
                        onChange={(event) =>
                          updateExchangeAccount(
                            editingExchangeAccount.slug,
                            (account) => ({
                              ...account,
                              description: event.target.value,
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                        info="Optional notes about what this exchange account is for."
                      />
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <CredentialSettingsField
                        label={`${getExchangeAccountTypeLabel(
                          editingExchangeAccount.type,
                        )} API Key`}
                        value={editingExchangeAccount.credentials.apiKey}
                        revealed={currentRevealedCredentials.apiKey}
                        setRevealed={(revealed) =>
                          setCredentialRevealed("apiKey", revealed)
                        }
                        onBlur={persistAccountDraft}
                        onChange={(value) =>
                          updateExchangeAccount(
                            editingExchangeAccount.slug,
                            (account) => ({
                              ...account,
                              credentials: {
                                ...account.credentials,
                                apiKey: value,
                              },
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                        info="Private API key used for this account's balance checks and live orders."
                      />
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <CredentialSettingsField
                        label={`${getExchangeAccountTypeLabel(
                          editingExchangeAccount.type,
                        )} API Secret`}
                        value={editingExchangeAccount.credentials.apiSecret}
                        revealed={currentRevealedCredentials.apiSecret}
                        setRevealed={(revealed) =>
                          setCredentialRevealed("apiSecret", revealed)
                        }
                        onBlur={persistAccountDraft}
                        onChange={(value) =>
                          updateExchangeAccount(
                            editingExchangeAccount.slug,
                            (account) => ({
                              ...account,
                              credentials: {
                                ...account.credentials,
                                apiSecret: value,
                              },
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                        info="Private API secret saved into the local SLOW config JSON."
                      />
                    </Grid>

                  </Grid>
                </Stack>
              )}
            </Grid>
          </Grid>
        </Stack>
      )}
    </ButtonDialog>
  );
}
