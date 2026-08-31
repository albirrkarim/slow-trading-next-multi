import type {
  SlowTradingMode,
  SlowTradingSafeHavenConfig,
  SlowTradingSafeHavenSchedule,
} from "../types";
import slowTradingSafeHavenSchedule from "../safe-haven-schedule";

function normalizeLastQueuedAt(
  value: unknown,
): Partial<Record<SlowTradingMode, number>> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Partial<Record<SlowTradingMode, unknown>>;
  const live = Number(raw.live);
  const sandbox = Number(raw.sandbox);
  const result = {
    ...(Number.isFinite(live) && live > 0 ? { live } : {}),
    ...(Number.isFinite(sandbox) && sandbox > 0 ? { sandbox } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Normalizes one persisted Safe Haven schedule. */
function normalizeSchedule(
  value: unknown,
  index: number,
): SlowTradingSafeHavenSchedule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SlowTradingSafeHavenSchedule>;
  const lastQueuedAt = normalizeLastQueuedAt(raw.lastQueuedAt);
  return {
    id: String(raw.id ?? "").trim() || `safe-haven-${index + 1}`,
    name: String(raw.name ?? "").trim() || `Safe Haven ${index + 1}`,
    enabled: raw.enabled !== false,
    amountUSDT: Math.max(0, Number(raw.amountUSDT) || 0),
    pct: Math.min(100, Math.max(0, Number(raw.pct) || 0)),
    dayOfMonth: slowTradingSafeHavenSchedule.values.normalizeDayOfMonth(
      raw.dayOfMonth,
    ),
    ...(lastQueuedAt ? { lastQueuedAt } : {}),
  };
}

/** Normalizes Safe Haven config and migrates the legacy monthly model fields. */
export function normalizeSafeHavenConfig(
  value: unknown,
  legacy?: {
    safeUSDTPerMonth?: number;
    safePercentPerMonth?: number;
  },
): SlowTradingSafeHavenConfig {
  const hasModernConfig = Boolean(value && typeof value === "object");
  const raw = hasModernConfig
    ? (value as Partial<SlowTradingSafeHavenConfig>)
    : {};
  const legacyAmount = Math.max(0, Number(legacy?.safeUSDTPerMonth) || 0);
  const legacyPct = Math.max(
    0,
    (Number(legacy?.safePercentPerMonth) || 0) * 100,
  );
  const scheduleValues = Array.isArray(raw.schedules)
    ? raw.schedules
    : !hasModernConfig && (legacyAmount > 0 || legacyPct > 0)
      ? [
          {
            id: "legacy-safe-haven",
            name: "Default Safe Haven",
            enabled: true,
            amountUSDT: legacyAmount,
            pct: legacyPct,
            dayOfMonth: 1,
          },
        ]
      : [];

  return {
    autoEnabled: hasModernConfig
      ? Boolean(raw.autoEnabled)
      : scheduleValues.length > 0,
    schedules: scheduleValues
      .map((schedule, index) => normalizeSchedule(schedule, index))
      .filter((schedule): schedule is SlowTradingSafeHavenSchedule =>
        Boolean(schedule),
      ),
  };
}
