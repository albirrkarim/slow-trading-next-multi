"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useSnackbar } from "notistack";
import { useCallback, useEffect, useMemo, useState } from "react";

import { endpoints } from "@/components/endpoints";
import type { SlowTradingMcpPermission } from "@/lib/slowTrading/types";

import SettingsDialogSection from "./SettingsDialogSection";
import SettingsDialogMcpToolPreview, {
  type McpToolCatalogItem,
} from "./SettingsDialogMcpToolPreview";

const MCP_PERMISSIONS: Array<{
  key: SlowTradingMcpPermission;
  label: string;
  description: string;
}> = [
  {
    key: "tags.read",
    label: "Tags read",
    description: "List tag definitions, descriptions, filters, and assignments.",
  },
  {
    key: "tags.write",
    label: "Tags write",
    description: "Create, update, and delete reusable tags.",
  },
  {
    key: "coin_metadata.read",
    label: "Coin metadata read",
    description: "Read coin descriptions and tag attachments.",
  },
  {
    key: "coin_metadata.write",
    label: "Coin metadata write",
    description: "Edit descriptions and tag attachments.",
  },
  {
    key: "coin_metadata.broadcast",
    label: "Metadata broadcast",
    description: "Manually broadcast metadata to peer instances.",
  },
  {
    key: "balance.read",
    label: "Balance read",
    description:
      "Read available, spendable, reserved, Safe Haven, locked, and total balance values with their meanings.",
  },
  {
    key: "trade_history.read",
    label: "Trade history read",
    description: "Read closed history and open positions.",
  },
];

interface McpTokenRecord {
  id: string;
  name: string;
  enabled: boolean;
  permissions: SlowTradingMcpPermission[];
  secretAvailable: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

interface McpTokensResponse {
  tools?: McpToolCatalogItem[];
  tokens: McpTokenRecord[];
}

interface McpCreateResponse {
  token: string;
  record: McpTokenRecord;
}

interface McpRevealResponse {
  token: string;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleString();
}

function hasPermission(
  permissions: SlowTradingMcpPermission[],
  permission: SlowTradingMcpPermission,
) {
  return permissions.includes(permission);
}

function McpUsageSnippet(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <Box>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Box
        component="pre"
        sx={(theme) => ({
          backgroundColor: theme.palette.action.hover,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          fontFamily: "monospace",
          fontSize: "0.78rem",
          lineHeight: 1.45,
          m: 0,
          mt: 0.5,
          overflowX: "auto",
          p: 1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        })}
      >
        {value}
      </Box>
    </Box>
  );
}

export default function SettingsDialogMcpTab() {
  const { enqueueSnackbar } = useSnackbar();
  const allPermissionKeys = useMemo(
    () => MCP_PERMISSIONS.map((permission) => permission.key),
    [],
  );
  const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
  const [tools, setTools] = useState<McpToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState("ChatGPT connector");
  const [newTokenPermissions, setNewTokenPermissions] =
    useState<SlowTradingMcpPermission[]>(allPermissionKeys);
  const [visibleTokens, setVisibleTokens] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState("");

  const mcpBaseUrl = `${origin || "https://fast.reinventwp.com"}/api/mcp`;

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<McpTokensResponse>(
        endpoints.slow.prod.mcpTokens,
      );
      setTokens(response.data.tokens ?? []);
      setTools(response.data.tools ?? []);
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error ?? error.message ?? "Failed to load MCP tokens",
        { variant: "error" },
      );
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const updateToken = async (
    token: McpTokenRecord,
    patch: Partial<Pick<McpTokenRecord, "enabled" | "name" | "permissions">>,
  ) => {
    setSavingId(token.id);
    try {
      const response = await axios.patch<McpTokensResponse>(
        endpoints.slow.prod.mcpTokens,
        {
          id: token.id,
          ...patch,
        },
      );
      setTokens(response.data.tokens ?? []);
      setVisibleTokens((current) => {
        const next = { ...current };
        delete next[token.id];
        return next;
      });
      enqueueSnackbar("MCP token updated", { variant: "success" });
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error ?? error.message ?? "Failed to update MCP token",
        { variant: "error" },
      );
    } finally {
      setSavingId(null);
    }
  };

  const deleteToken = async (token: McpTokenRecord) => {
    if (!confirm(`Delete MCP token "${token.name}"? Agents using it will stop working.`)) {
      return;
    }

    setSavingId(token.id);
    try {
      const response = await axios.delete<McpTokensResponse>(
        endpoints.slow.prod.mcpTokens,
        {
          data: {
            id: token.id,
          },
        },
      );
      setTokens(response.data.tokens ?? []);
      enqueueSnackbar("MCP token deleted", { variant: "success" });
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error ?? error.message ?? "Failed to delete MCP token",
        { variant: "error" },
      );
    } finally {
      setSavingId(null);
    }
  };

  const createToken = async () => {
    setSavingId("new");
    try {
      const response = await axios.post<McpCreateResponse>(
        endpoints.slow.prod.mcpTokens,
        {
          name: newTokenName,
          permissions: newTokenPermissions,
        },
      );
      setVisibleTokens((current) => ({
        ...current,
        [response.data.record.id]: response.data.token,
      }));
      setTokens((current) => [...current, response.data.record]);
      enqueueSnackbar("MCP token created", { variant: "success" });
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error ?? error.message ?? "Failed to create MCP token",
        { variant: "error" },
      );
    } finally {
      setSavingId(null);
    }
  };

  const revealToken = async (token: McpTokenRecord) => {
    setSavingId(token.id);
    try {
      const response = await axios.post<McpRevealResponse>(
        endpoints.slow.prod.mcpTokens,
        {
          action: "reveal",
          id: token.id,
        },
      );
      setVisibleTokens((current) => ({
        ...current,
        [token.id]: response.data.token,
      }));
      enqueueSnackbar("MCP token secret shown", { variant: "success" });
    } catch (error: any) {
      enqueueSnackbar(
        error.response?.data?.error ?? error.message ?? "Failed to reveal MCP token",
        { variant: "error" },
      );
    } finally {
      setSavingId(null);
    }
  };

  const togglePermission = (
    permissions: SlowTradingMcpPermission[],
    permission: SlowTradingMcpPermission,
  ) =>
    hasPermission(permissions, permission)
      ? permissions.filter((item) => item !== permission)
      : [...permissions, permission];

  return (
    <SettingsDialogSection
      title="MCP"
      description="Generate bearer tokens for ChatGPT, Codex, and other MCP clients. The MCP URL is /api/mcp on this site."
    >
      <Stack spacing={2.5}>
        <Alert severity={tokens.length > 0 ? "info" : "warning"}>
          {tokens.length > 0
            ? "MCP is enabled for active tokens only. New token secrets are encrypted and can be shown again from this tab."
            : "MCP is disabled until you create and enable at least one token."}
        </Alert>

        <Box
          sx={(theme) => ({
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            p: 1.5,
          })}
        >
          <Typography fontWeight={700} variant="body2">
            Quick setup
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            Create a token, click Show, then use the token in one of these clients.
            Keep the token and ChatGPT URL private.
          </Typography>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
              mt: 1.5,
            }}
          >
            <McpUsageSnippet
              label="ChatGPT Connector"
              value={`${mcpBaseUrl}/<token>\nAuth: No Auth`}
            />
            <McpUsageSnippet
              label="Codex"
              value={`export SLOW_MCP_TOKEN="<token>"\ncodex mcp add slow-mcp --url ${mcpBaseUrl} --bearer-token-env-var SLOW_MCP_TOKEN`}
            />
            <McpUsageSnippet
              label="mcporter"
              value={`mcporter config add slow-mcp --scope home --url ${mcpBaseUrl} --transport http --header "Authorization=Bearer <token>"`}
            />
          </Box>

          <Typography color="text.secondary" variant="caption" sx={{ mt: 1, display: "block" }}>
            ChatGPT cannot reach localhost directly; use the online site URL or an HTTPS tunnel.
          </Typography>
        </Box>

        <Box
          sx={(theme) => ({
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            p: 1.5,
          })}
        >
          <Typography fontWeight={700} variant="body2">
            Create token
          </Typography>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(220px, 320px) 1fr auto",
              },
              alignItems: "start",
              mt: 1.5,
            }}
          >
            <TextField
              label="New token name"
              value={newTokenName}
              onChange={(event) => setNewTokenName(event.target.value)}
              size="small"
            />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 0.5,
              }}
            >
              {MCP_PERMISSIONS.map((permission) => (
                <Tooltip
                  key={permission.key}
                  title={permission.description}
                  placement="top"
                  arrow
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={hasPermission(
                          newTokenPermissions,
                          permission.key,
                        )}
                        size="small"
                        onChange={() =>
                          setNewTokenPermissions((current) =>
                            togglePermission(current, permission.key),
                          )
                        }
                      />
                    }
                    label={permission.label}
                  />
                </Tooltip>
              ))}
            </Box>

            <Button
              disabled={savingId !== null || newTokenPermissions.length === 0}
              onClick={() => void createToken()}
              startIcon={
                savingId === "new" ? <CircularProgress size={16} /> : <SaveIcon />
              }
              variant="contained"
            >
              Create
            </Button>
          </Box>

          <Box sx={{ mt: 1.5 }}>
            <SettingsDialogMcpToolPreview
              permissions={newTokenPermissions}
              tools={tools}
            />
          </Box>
        </Box>

        <Divider />

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={16} />
            <Typography variant="body2">Loading MCP tokens...</Typography>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {tokens.length === 0 && (
              <Typography color="text.secondary" variant="body2">
                No MCP tokens yet.
              </Typography>
            )}

            {tokens.map((token) => (
              <Box
                key={token.id}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                <Stack spacing={1.5}>
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1,
                      gridTemplateColumns: { xs: "1fr", md: "1fr auto auto auto" },
                      alignItems: "center",
                    }}
                  >
                    <TextField
                      label="Token name"
                      defaultValue={token.name}
                      size="small"
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== token.name) {
                          void updateToken(token, { name });
                        }
                      }}
                    />

                    <FormControlLabel
                      control={
                        <Switch
                          checked={token.enabled}
                          disabled={savingId === token.id}
                          onChange={(event) =>
                            void updateToken(token, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                      }
                      label={token.enabled ? "Enabled" : "Disabled"}
                    />

                    <Tooltip
                      title={
                        visibleTokens[token.id]
                          ? "Hide token secret"
                          : "Show token secret"
                      }
                    >
                      <span>
                        <Button
                          disabled={savingId === token.id}
                          onClick={() => {
                            if (visibleTokens[token.id]) {
                              setVisibleTokens((current) => {
                                const next = { ...current };
                                delete next[token.id];
                                return next;
                              });
                              return;
                            }
                            void revealToken(token);
                          }}
                          size="small"
                          startIcon={
                            savingId === token.id ? (
                              <CircularProgress size={16} />
                            ) : visibleTokens[token.id] ? (
                              <VisibilityOffIcon />
                            ) : (
                              <VisibilityIcon />
                            )
                          }
                          variant="outlined"
                        >
                          {visibleTokens[token.id] ? "Hide" : "Show"}
                        </Button>
                      </span>
                    </Tooltip>

                    <Tooltip title="Delete token">
                      <span>
                        <IconButton
                          color="error"
                          disabled={savingId === token.id}
                          onClick={() => void deleteToken(token)}
                        >
                          {savingId === token.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <DeleteIcon />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>

                  <Typography color="text.secondary" variant="caption">
                    Created {formatTimestamp(token.createdAt)} · Last used{" "}
                    {formatTimestamp(token.lastUsedAt)}
                  </Typography>

                  {visibleTokens[token.id] && (
                    <Alert
                      severity="success"
                      variant="outlined"
                      action={
                        <Button
                          color="inherit"
                          size="small"
                          startIcon={<ContentCopyIcon />}
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              visibleTokens[token.id],
                            );
                            enqueueSnackbar("Copied MCP token", {
                              variant: "success",
                            });
                          }}
                        >
                          Copy
                        </Button>
                      }
                    >
                      <Typography fontWeight={700} variant="body2">
                        Token secret
                      </Typography>
                      <Typography
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {visibleTokens[token.id]}
                      </Typography>
                    </Alert>
                  )}

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                      gap: 0.5,
                    }}
                  >
                    {MCP_PERMISSIONS.map((permission) => (
                      <Tooltip
                        key={permission.key}
                        title={permission.description}
                        placement="top"
                        arrow
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={hasPermission(
                                token.permissions,
                                permission.key,
                              )}
                              disabled={savingId === token.id}
                              size="small"
                              onChange={() =>
                                void updateToken(token, {
                                  permissions: togglePermission(
                                    token.permissions,
                                    permission.key,
                                  ),
                                })
                              }
                            />
                          }
                          label={permission.label}
                        />
                      </Tooltip>
                    ))}
                  </Box>

                  <SettingsDialogMcpToolPreview
                    permissions={token.permissions}
                    tools={tools}
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </SettingsDialogSection>
  );
}
