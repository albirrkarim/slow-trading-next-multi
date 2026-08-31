export type NotificationChannel = "telegram" | "email";
export type NotificationDashboard = "SLOW";
export interface NotificationTypeInfo {
  label: string;
  description: string;
}

export const DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL = 3;
export const DEFAULT_LONG_OPEN_POSITION_HOUR = 24;
export const DEFAULT_STALE_POSITION_HOUR = 1;

export const SLOW_NOTIFICATION_KEYS = [
  "NOTIF_ENTRY",
  "NOTIF_ENTRY_FAILED",
  "NOTIF_EXIT",
  "NOTIF_EXIT_FAILED",
  "NOTIF_AVERAGE",
  "NOTIF_AVERAGE_FAILED",
  "NOTIF_HIGH_VOLATILITY",
  "NOTIF_STALE_POSITION",
  "NOTIF_LONG_OPEN_POSITION",
  "NOTIF_MANAGEMENT_ACTION",
  "NOTIF_BLACK_SWAN_ACTION",
  "NOTIF_DAILY_PNL_LIMIT",
  "NOTIF_DAILY_PERFORMANCE",
  "NOTIF_ERROR",
] as const;

export type SlowNotificationKey = (typeof SLOW_NOTIFICATION_KEYS)[number];
export type NotificationKey = SlowNotificationKey;

export interface NotificationTypeConfig {
  id: SlowNotificationKey;
  params?: {
    add?: boolean;
    hour?: number;
    level?: number;
    remove?: boolean;
  };
}

export const SLOW_NOTIFICATION_TYPE_INFO: Record<
  SlowNotificationKey,
  NotificationTypeInfo
> = {
  NOTIF_ENTRY: {
    label: "Entry",
    description: "Sent when SLOW successfully opens an entry position.",
  },
  NOTIF_ENTRY_FAILED: {
    label: "Entry Failed",
    description:
      "Sent when SLOW wants to enter but order execution or validation fails.",
  },
  NOTIF_EXIT: {
    label: "Exit",
    description: "Sent when SLOW successfully closes a position.",
  },
  NOTIF_EXIT_FAILED: {
    label: "Exit Failed",
    description:
      "Sent when SLOW tries to close a position but the exit execution fails.",
  },
  NOTIF_AVERAGE: {
    label: "Average / Add Position",
    description:
      "Sent when SLOW successfully averages or adds to an existing position via watch logic.",
  },
  NOTIF_AVERAGE_FAILED: {
    label: "Average / Add Position Failed",
    description:
      "Sent when SLOW tries to average or add to an existing position but fails.",
  },
  NOTIF_HIGH_VOLATILITY: {
    label: "High Volatility",
    description:
      "Sent when a symbol reaches the configured minimum absolute volatility level. It resets after the symbol drops below that level.",
  },
  NOTIF_STALE_POSITION: {
    label: "Stale Position",
    description:
      "Sent when an open position remains open beyond this channel's configured hours after reaching its target volatility point.",
  },
  NOTIF_LONG_OPEN_POSITION: {
    label: "Long Open Position",
    description:
      "Sent when a position remains open beyond this channel's configured hours after entry.",
  },
  NOTIF_MANAGEMENT_ACTION: {
    label: "Management Action",
    description:
      "Sent when SLOW adds or removes a symbol from the configured Coin Management list. Add and Remove can be selected independently.",
  },
  NOTIF_BLACK_SWAN_ACTION: {
    label: "Black Swan Action",
    description:
      "Sent when portfolio protection changes state or schedules emergency position exits.",
  },
  NOTIF_DAILY_PNL_LIMIT: {
    label: "Daily PnL Entry Stop",
    description:
      "Sent when current UTC-day navbar USD PnL reaches the configured automatic-entry stop.",
  },
  NOTIF_DAILY_PERFORMANCE: {
    label: "Daily Trade Performance",
    description:
      "Sent once after each UTC day closes with the previous day's trade and balance performance.",
  },
  NOTIF_ERROR: {
    label: "Error",
    description:
      "Sent for operational SLOW errors outside normal entry and exit flows.",
  },
};

export interface NotificationRouteConfig {
  enabled: boolean;
  types: NotificationTypeConfig[];
}

export interface DashboardNotificationConfig {
  telegram: NotificationRouteConfig;
  email: NotificationRouteConfig;
}

/** Normalizes a High Volatility absolute-level threshold. */
export function normalizeHighVolatilityMinAbsoluteLevel(
  value: unknown,
): number {
  if (value === null || value === "") {
    return DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL;
  }

  return Math.max(1, Math.floor(parsed));
}

/** Normalizes the per-channel Stale Position hour threshold. */
export function normalizeStalePositionHour(value: unknown): number {
  if (value === null || value === "") {
    return DEFAULT_STALE_POSITION_HOUR;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_STALE_POSITION_HOUR;
  }

  return Math.max(0.01, parsed);
}

/** Normalizes the per-channel Long Open Position hour threshold. */
export function normalizeLongOpenPositionHour(value: unknown): number {
  if (value === null || value === "") {
    return DEFAULT_LONG_OPEN_POSITION_HOUR;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LONG_OPEN_POSITION_HOUR;
  }

  return Math.max(0.01, parsed);
}

/** Creates one notification type with its default parameter values. */
export function createNotificationTypeConfig(
  id: SlowNotificationKey,
): NotificationTypeConfig {
  if (id === "NOTIF_HIGH_VOLATILITY") {
    return {
      id,
      params: { level: DEFAULT_HIGH_VOLATILITY_MIN_ABSOLUTE_LEVEL },
    };
  }

  if (id === "NOTIF_STALE_POSITION") {
    return {
      id,
      params: { hour: DEFAULT_STALE_POSITION_HOUR },
    };
  }

  if (id === "NOTIF_LONG_OPEN_POSITION") {
    return {
      id,
      params: { hour: DEFAULT_LONG_OPEN_POSITION_HOUR },
    };
  }

  if (id === "NOTIF_MANAGEMENT_ACTION") {
    return {
      id,
      params: { add: true, remove: true },
    };
  }

  return { id };
}

function normalizeNotificationTypeConfig(
  value: unknown,
): NotificationTypeConfig | null {
  const id =
    value && typeof value === "object"
      ? String((value as { id?: unknown }).id ?? "")
      : "";

  if (!SLOW_NOTIFICATION_KEYS.includes(id as SlowNotificationKey)) {
    return null;
  }

  const normalizedId = id as SlowNotificationKey;
  const rawParams =
    value && typeof value === "object"
      ? (value as { params?: unknown }).params
      : undefined;
  const params =
    rawParams && typeof rawParams === "object"
      ? (rawParams as Record<string, unknown>)
      : undefined;

  if (normalizedId === "NOTIF_HIGH_VOLATILITY") {
    return {
      id: normalizedId,
      params: {
        level: normalizeHighVolatilityMinAbsoluteLevel(
          params?.level,
        ),
      },
    };
  }

  if (normalizedId === "NOTIF_STALE_POSITION") {
    return {
      id: normalizedId,
      params: {
        hour: normalizeStalePositionHour(params?.hour),
      },
    };
  }

  if (normalizedId === "NOTIF_LONG_OPEN_POSITION") {
    return {
      id: normalizedId,
      params: {
        hour: normalizeLongOpenPositionHour(params?.hour),
      },
    };
  }

  if (normalizedId === "NOTIF_MANAGEMENT_ACTION") {
    return {
      id: normalizedId,
      params: {
        add: typeof params?.add === "boolean" ? params.add : true,
        remove: typeof params?.remove === "boolean" ? params.remove : true,
      },
    };
  }

  return { id: normalizedId };
}

function createDefaultNotificationTypes(): NotificationTypeConfig[] {
  return SLOW_NOTIFICATION_KEYS.map(createNotificationTypeConfig);
}

export function createDefaultDashboardNotificationConfig(
  _dashboard: NotificationDashboard,
): DashboardNotificationConfig {
  return {
    telegram: {
      enabled: true,
      types: createDefaultNotificationTypes(),
    },
    email: {
      enabled: false,
      types: createDefaultNotificationTypes(),
    },
  };
}

export function normalizeNotificationTypes(
  types: unknown,
  _dashboard: NotificationDashboard,
): NotificationTypeConfig[] {
  if (!Array.isArray(types)) {
    return [];
  }

  const normalized = new Map<SlowNotificationKey, NotificationTypeConfig>();

  for (const item of types) {
    const typeConfig = normalizeNotificationTypeConfig(item);
    if (typeConfig) {
      normalized.set(typeConfig.id, typeConfig);
    }
  }

  return Array.from(normalized.values());
}

function normalizeRouteConfig(
  value: unknown,
  fallback: NotificationRouteConfig,
  dashboard: NotificationDashboard,
): NotificationRouteConfig {
  return {
    enabled:
      typeof (value as NotificationRouteConfig | undefined)?.enabled ===
      "boolean"
        ? Boolean((value as NotificationRouteConfig).enabled)
        : fallback.enabled,
    types: Array.isArray((value as NotificationRouteConfig | undefined)?.types)
      ? normalizeNotificationTypes(
          (value as NotificationRouteConfig).types,
          dashboard,
        )
      : fallback.types.map((item) => ({
          ...item,
          params: item.params ? { ...item.params } : undefined,
        })),
  };
}

export function normalizeDashboardNotificationConfig(
  value: unknown,
  dashboard: NotificationDashboard,
): DashboardNotificationConfig {
  const fallback = createDefaultDashboardNotificationConfig(dashboard);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    telegram: normalizeRouteConfig(
      (value as DashboardNotificationConfig).telegram,
      fallback.telegram,
      dashboard,
    ),
    email: normalizeRouteConfig(
      (value as DashboardNotificationConfig).email,
      fallback.email,
      dashboard,
    ),
  };
}

export function getNotificationTypeConfig(
  config: DashboardNotificationConfig,
  channel: NotificationChannel,
  key: string,
): NotificationTypeConfig | undefined {
  if (!config[channel].enabled) {
    return undefined;
  }

  return config[channel].types.find((item) => item.id === key);
}

export function getChannelsForNotification(
  config: DashboardNotificationConfig,
  key: string,
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  if (getNotificationTypeConfig(config, "telegram", key)) {
    channels.push("telegram");
  }

  if (getNotificationTypeConfig(config, "email", key)) {
    channels.push("email");
  }

  return channels;
}

export function getNotificationTypeInfo(
  dashboard: NotificationDashboard,
  key: string,
): NotificationTypeInfo {
  return (
    SLOW_NOTIFICATION_TYPE_INFO[key as SlowNotificationKey] ?? {
      label: key,
      description: key,
    }
  );
}
