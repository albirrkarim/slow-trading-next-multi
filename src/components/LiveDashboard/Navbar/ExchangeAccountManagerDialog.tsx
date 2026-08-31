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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";

import { endpoints } from "@/components/endpoints";
import ButtonDialog from "@/components/ui/ButtonDialog";
import IconButtonTooltip from "@/components/ui/IconButtonTooltip";
import type {
  ExchangeAccount,
  ExchangeAccountType,
} from "@/lib/exchange/account-context";
import type { ConfigDraft, ConfigDraftSetter } from "./types";
import SettingsInfoField from "./SettingsInfoField";
import { tradeLog } from "@/lib/trading/helper/log";

const EXCHANGE_ACCOUNT_TYPE_OPTIONS: Array<{
  value: ExchangeAccountType;
  label: string;
}> = [
  { value: "binance", label: "Binance" },
  { value: "okx", label: "OKX" },
  { value: "tokocrypto", label: "Tokocrypto" },
];

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
  return (
    EXCHANGE_ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)
      ?.label ?? type
  );
}

export function getExchangeAccountOptionLabel(
  account: ExchangeAccount,
): string {
  return `${account.name || account.id} (${getExchangeAccountTypeLabel(
    account.type,
  )})`;
}

function createEmptyCredentials(
  type: ExchangeAccountType,
): ExchangeAccount["credentials"] {
  if (type === "okx") {
    return {
      apiKey: "",
      apiSecret: "",
      passphrase: "",
    };
  }

  return {
    apiKey: "",
    apiSecret: "",
  };
}

function changeAccountType(
  account: ExchangeAccount,
  type: ExchangeAccountType,
): ExchangeAccount {
  const baseCredentials = createEmptyCredentials(type);
  const credentials = {
    ...baseCredentials,
    apiKey: account.credentials.apiKey,
    apiSecret: account.credentials.apiSecret,
  };

  if (type === "okx") {
    return {
      ...account,
      type,
      credentials: {
        ...credentials,
        passphrase: account.credentials.passphrase ?? "",
      },
      updatedAt: Date.now(),
    };
  }

  return {
    ...account,
    type,
    credentials,
    updatedAt: Date.now(),
  };
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
  const [editingExchangeAccountId, setEditingExchangeAccountId] = useState(
    configDraft.exchangeAccountId,
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
    (account) => account.id === editingExchangeAccountId,
  )
    ? editingExchangeAccountId
    : (configDraft.exchangeAccounts.find(
        (account) => account.id === configDraft.exchangeAccountId,
      )?.id ??
      configDraft.exchangeAccounts[0]?.id ??
      configDraft.exchangeAccountId);
  const editingExchangeAccount =
    configDraft.exchangeAccounts.find(
      (account) => account.id === effectiveEditingAccountId,
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
    accounts: ExchangeAccount[],
    exchangeAccountId: string,
  ) => {
    setSaveStatus("saving");
    try {
      await axios.put(endpoints.slow.prod.exchangeAccounts, {
        accounts,
        exchangeAccountId,
      });
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
        draftToSave.exchangeAccountId,
      );
    }
  };

  const persistAccountDraft = () => {
    applyAccountDraftUpdate((draft) => draft, { persist: true });
  };

  const updateExchangeAccount = (
    accountId: string,
    updater: (account: ExchangeAccount) => ExchangeAccount,
  ) => {
    applyAccountDraftUpdate((prev) => {
      let selectedAccount: ExchangeAccount | undefined;
      const exchangeAccounts = prev.exchangeAccounts.map((account) => {
        if (account.id !== accountId) {
          return account;
        }

        const nextAccount = updater(account);
        if (prev.exchangeAccountId === accountId) {
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

  const createExchangeAccountId = () => {
    const usedIds = new Set(
      configDraft.exchangeAccounts
        .map((account) => Number(account.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
    let nextId = 1;
    while (usedIds.has(nextId)) {
      nextId += 1;
    }
    return String(nextId);
  };

  const addExchangeAccount = () => {
    const now = Date.now();
    const type = configDraft.exchangeType as ExchangeAccountType;
    const account: ExchangeAccount = {
      id: createExchangeAccountId(),
      type,
      name: `${getExchangeAccountTypeLabel(type)} ${
        configDraft.exchangeAccounts.length + 1
      }`,
      description: "",
      credentials: createEmptyCredentials(type),
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
    setEditingExchangeAccountId(account.id);
  };

  const deleteEditingExchangeAccount = () => {
    if (!editingExchangeAccount || configDraft.exchangeAccounts.length <= 1) {
      return;
    }

    applyAccountDraftUpdate(
      (prev) => {
        const exchangeAccounts = prev.exchangeAccounts.filter(
          (account) => account.id !== editingExchangeAccount.id,
        );
        const exchangeAccountId =
          prev.exchangeAccountId === editingExchangeAccount.id
            ? (exchangeAccounts[0]?.id ?? prev.exchangeAccountId)
            : prev.exchangeAccountId;
        const selectedAccount = exchangeAccounts.find(
          (account) => account.id === exchangeAccountId,
        );

        return {
          ...prev,
          exchangeAccountId,
          exchangeAccounts,
          exchangeType: selectedAccount?.type ?? prev.exchangeType,
        };
      },
      { persist: true },
    );
    setEditingExchangeAccountId(
      configDraft.exchangeAccounts.find(
        (account) => account.id !== editingExchangeAccount.id,
      )?.id ?? configDraft.exchangeAccountId,
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
                Pick one to edit. The trading account is selected in Main.
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
                  const selected = account.id === editingExchangeAccount?.id;
                  const active = account.id === configDraft.exchangeAccountId;
                  return (
                    <Button
                      key={account.id}
                      variant={selected ? "contained" : "outlined"}
                      color={selected ? "primary" : "inherit"}
                      onClick={() => setEditingExchangeAccountId(account.id)}
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
                          {account.name || account.id}
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
                      {active && (
                        <Chip
                          color={selected ? "default" : "primary"}
                          label="Active"
                          size="small"
                        />
                      )}
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
                            editingExchangeAccount.id,
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
                        select
                        size="small"
                        fullWidth
                        value={editingExchangeAccount.type}
                        onBlur={persistAccountDraft}
                        onChange={(event) =>
                          updateExchangeAccount(
                            editingExchangeAccount.id,
                            (account) =>
                              changeAccountType(
                                account,
                                event.target.value as ExchangeAccountType,
                              ),
                          )
                        }
                        info="Choose which exchange adapter this account's credentials belong to."
                      >
                        {EXCHANGE_ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </SettingsInfoField>
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
                            editingExchangeAccount.id,
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
                            editingExchangeAccount.id,
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
                        info="Private API key used for balance checks and live orders when this account is selected."
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
                            editingExchangeAccount.id,
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

                    {editingExchangeAccount.type === "okx" && (
                      <Grid size={{ xs: 12 }}>
                        <CredentialSettingsField
                          label="OKX API Passphrase"
                          value={
                            editingExchangeAccount.credentials.passphrase ?? ""
                          }
                          revealed={currentRevealedCredentials.passphrase}
                          setRevealed={(revealed) =>
                            setCredentialRevealed("passphrase", revealed)
                          }
                          onBlur={persistAccountDraft}
                          onChange={(value) =>
                            updateExchangeAccount(
                              editingExchangeAccount.id,
                              (account) => ({
                                ...account,
                                credentials: {
                                  ...account.credentials,
                                  passphrase: value,
                                },
                                updatedAt: Date.now(),
                              }),
                            )
                          }
                          info="Private OKX passphrase saved into the local SLOW config JSON."
                        />
                      </Grid>
                    )}
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
