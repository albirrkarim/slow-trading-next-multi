const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatUnit(value: number, singular: string) {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

/** Formats an open position's exact elapsed age using whole time units. */
function format(entryTime: number, currentTime = Date.now()) {
  if (!Number.isFinite(entryTime) || !Number.isFinite(currentTime)) {
    return "Unknown duration";
  }

  const elapsedMs = Math.max(0, currentTime - entryTime);
  const days = Math.floor(elapsedMs / DAY_MS);
  const hours = Math.floor((elapsedMs % DAY_MS) / HOUR_MS);

  if (days > 0) {
    return `${formatUnit(days, "day")} ${formatUnit(hours, "hour")}`;
  }

  if (hours > 0) {
    return formatUnit(hours, "hour");
  }

  const minutes = Math.floor(elapsedMs / MINUTE_MS);
  return formatUnit(minutes, "minute");
}

/** Checks whether a position age strictly exceeds the provided day count. */
function isOlderThanDays(
  entryTime: number,
  days: number,
  currentTime = Date.now(),
) {
  return (
    Number.isFinite(entryTime) &&
    Number.isFinite(days) &&
    Number.isFinite(currentTime) &&
    currentTime - entryTime > Math.max(0, days) * DAY_MS
  );
}

const openPositionDuration = {
  format,
  isOlderThanDays,
} as const;

export default openPositionDuration;
