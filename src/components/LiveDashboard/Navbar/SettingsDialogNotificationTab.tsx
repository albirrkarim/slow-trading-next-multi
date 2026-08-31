"use client";

import { endpoints } from "@/components/endpoints";
import PreviewOutlinedIcon from "@mui/icons-material/PreviewOutlined";
import type {
  DashboardNotificationConfig,
  NotificationChannel,
  NotificationTypeConfig,
  SlowNotificationKey,
} from "@/lib/notification/config";
import {
  createNotificationTypeConfig,
  DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL,
  DEFAULT_LONG_OPEN_POSITION_HOUR,
  DEFAULT_STALE_POSITION_HOUR,
  SLOW_NOTIFICATION_KEYS,
  SLOW_NOTIFICATION_TYPE_INFO,
} from "@/lib/notification/config";
import {
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useSnackbar } from "notistack";
import { useState } from "react";
import NotificationExampleDialog, {
  type NotificationExampleSelection,
} from "./NotificationExampleDialog";
import type { ConfigDraft, ConfigDraftSetter } from "./types";

const CHANNELS: Array<{
  key: NotificationChannel;
  label: string;
  description: string;
}> = [
  {
    key: "telegram",
    label: "Telegram",
    description:
      "Send SLOW dashboard execution notifications to the configured Telegram bot and chat.",
  },
  {
    key: "email",
    label: "Email",
    description:
      "Send the same SLOW dashboard execution notifications through the configured email sender.",
  },
];

export default function SettingsDialogNotificationTab(props: {
  configDraft: ConfigDraft;
  setConfigDraft: ConfigDraftSetter;
}) {
  const { configDraft, setConfigDraft } = props;
  const { enqueueSnackbar } = useSnackbar();
  const notification = configDraft.notification;
  const [testingChannel, setTestingChannel] =
    useState<NotificationChannel | null>(null);
  const [exampleSelection, setExampleSelection] =
    useState<NotificationExampleSelection | null>(null);

  const updateNotification = (
    updater: (
      current: DashboardNotificationConfig,
    ) => DashboardNotificationConfig,
  ) => {
    setConfigDraft((prev) =>
      prev
        ? {
            ...prev,
            notification: updater(prev.notification),
          }
        : prev,
    );
  };

  const sendTestNotification = async (channel: NotificationChannel) => {
    setTestingChannel(channel);
    try {
      await axios.post(endpoints.slow.prod.notificationTest, { channel });
      enqueueSnackbar(`Sent ${channel} test notification`, {
        variant: "success",
      });
    } catch (error: any) {
      enqueueSnackbar(
        `Failed to send ${channel} test: ${
          error.response?.data?.error || error.message
        }`,
        { variant: "error" },
      );
    } finally {
      setTestingChannel(null);
    }
  };

  const updateTypeParams = (
    channel: NotificationChannel,
    id: SlowNotificationKey,
    params: NotificationTypeConfig["params"],
  ) => {
    updateNotification((current) => ({
      ...current,
      [channel]: {
        ...current[channel],
        types: current[channel].types.map((item) =>
          item.id === id ? { ...item, params } : item,
        ),
      },
    }));
  };

  return (
    <Stack spacing={1}>
      <Grid container spacing={2}>
        {CHANNELS.map((channel) => {
          const route = notification[channel.key];

          return (
            <Grid key={channel.key} size={{ xs: 12, md: 6 }}>
              <Stack
                spacing={2}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  height: "100%",
                  p: 2,
                }}
              >
                <Tooltip arrow placement="top" title={channel.description}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={route.enabled}
                        onChange={(event) =>
                          updateNotification((current) => ({
                            ...current,
                            [channel.key]: {
                              ...current[channel.key],
                              enabled: event.target.checked,
                            },
                          }))
                        }
                        color="default"
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight="bold">
                        {channel.label}: {route.enabled ? "ON" : "OFF"}
                      </Typography>
                    }
                    sx={{ alignSelf: "flex-start", m: 0 }}
                  />
                </Tooltip>

                <Button
                  disabled={testingChannel !== null}
                  onClick={() => void sendTestNotification(channel.key)}
                  size="small"
                  sx={{ alignSelf: "flex-start", ml: 4 }}
                  startIcon={
                    testingChannel === channel.key ? (
                      <CircularProgress size={14} />
                    ) : undefined
                  }
                  variant="outlined"
                >
                  {testingChannel === channel.key
                    ? "Sending..."
                    : `Send ${channel.label} Test`}
                </Button>

                <Divider />

                <Stack spacing={0.25}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700 }}
                  >
                    Types
                  </Typography>

                  {SLOW_NOTIFICATION_KEYS.map((type) => {
                    const typeConfig = route.types.find(
                      (item) => item.id === type,
                    );
                    const checked = Boolean(typeConfig);
                    const info = SLOW_NOTIFICATION_TYPE_INFO[type];
                    const hourDefault =
                      type === "NOTIF_STALE_POSITION"
                        ? DEFAULT_STALE_POSITION_HOUR
                        : type === "NOTIF_LONG_OPEN_POSITION"
                          ? DEFAULT_LONG_OPEN_POSITION_HOUR
                          : null;

                    return (
                      <Stack
                        alignItems="center"
                        direction="row"
                        justifyContent="space-between"
                        key={`${channel.key}_${type}`}
                        spacing={1}
                        sx={{ minHeight: 44 }}
                      >
                        <Stack alignItems="center" direction="row" minWidth={0}>
                          <Tooltip
                            arrow
                            placement="right"
                            title={info.description}
                          >
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={checked}
                                  onChange={(event) =>
                                    updateNotification((current) => {
                                      const currentTypes =
                                        current[channel.key].types;
                                      return {
                                        ...current,
                                        [channel.key]: {
                                          ...current[channel.key],
                                          types: event.target.checked
                                            ? [
                                                ...currentTypes,
                                                createNotificationTypeConfig(
                                                  type,
                                                ),
                                              ]
                                            : currentTypes.filter(
                                                (item) => item.id !== type,
                                              ),
                                        },
                                      };
                                    })
                                  }
                                  color="default"
                                  size="small"
                                />
                              }
                              label={
                                <Typography variant="body2">
                                  {info.label}
                                </Typography>
                              }
                              sx={{ m: 0 }}
                            />
                          </Tooltip>
                          <Tooltip arrow title={`View ${info.label} example`}>
                            <IconButton
                              aria-label={`${channel.label} ${info.label} notification example`}
                              // PROD:NOTIF_EXAMPLE_PREVIEW
                              onClick={() =>
                                setExampleSelection({
                                  channel: channel.key,
                                  params:
                                    typeConfig?.params ??
                                    createNotificationTypeConfig(type).params,
                                  type,
                                })
                              }
                              size="small"
                              sx={{ height: 44, width: 44 }}
                            >
                              <PreviewOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>

                        {typeConfig && type === "NOTIF_HIGH_VOLATILITY" && (
                          <TextField
                            label="Level"
                            onChange={(event) =>
                              updateTypeParams(channel.key, type, {
                                level: Math.max(
                                  1,
                                  Math.floor(
                                    Number(event.target.value) ||
                                      DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL,
                                  ),
                                ),
                              })
                            }
                            size="small"
                            slotProps={{
                              htmlInput: {
                                "aria-label": `${channel.label} High Volatility Level`,
                                inputMode: "numeric",
                                min: 1,
                                step: "1",
                              },
                            }}
                            sx={{ flex: "0 0 92px" }}
                            type="number"
                            value={
                              typeConfig.params?.level ??
                              DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL
                            }
                          />
                        )}

                        {hourDefault !== null && (
                          <TextField
                            disabled={!typeConfig}
                            label="Hour"
                            onChange={(event) =>
                              updateTypeParams(channel.key, type, {
                                hour: Math.max(
                                  0.01,
                                  Number(event.target.value) || hourDefault,
                                ),
                              })
                            }
                            size="small"
                            slotProps={{
                              htmlInput: {
                                "aria-label": `${channel.label} ${info.label} Hour`,
                                inputMode: "decimal",
                                min: 0.01,
                                step: "0.25",
                              },
                            }}
                            sx={{ flex: "0 0 92px" }}
                            type="number"
                            value={typeConfig?.params?.hour ?? hourDefault}
                          />
                        )}

                        {typeConfig && type === "NOTIF_MANAGEMENT_ACTION" && (
                          <Stack direction="row" spacing={1}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={typeConfig.params?.add ?? true}
                                  inputProps={{
                                    "aria-label": `${channel.label} Management Action Add`,
                                  }}
                                  onChange={(event) =>
                                    updateTypeParams(channel.key, type, {
                                      ...typeConfig.params,
                                      add: event.target.checked,
                                    })
                                  }
                                  size="small"
                                />
                              }
                              label="Add"
                              sx={{ m: 0 }}
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={typeConfig.params?.remove ?? true}
                                  inputProps={{
                                    "aria-label": `${channel.label} Management Action Remove`,
                                  }}
                                  onChange={(event) =>
                                    updateTypeParams(channel.key, type, {
                                      ...typeConfig.params,
                                      remove: event.target.checked,
                                    })
                                  }
                                  size="small"
                                />
                              }
                              label="Remove"
                              sx={{ m: 0 }}
                            />
                          </Stack>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </Stack>
            </Grid>
          );
        })}
      </Grid>
      <NotificationExampleDialog
        onClose={() => setExampleSelection(null)}
        selection={exampleSelection}
      />
    </Stack>
  );
}
