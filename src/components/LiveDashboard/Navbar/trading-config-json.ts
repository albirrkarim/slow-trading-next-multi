import type { SlowTradingAccountTradingConfig } from "@/lib/slowTrading";

const BOOLEAN_KEYS = [
  "averagingRescueProjectionGuardEnabled",
  "enableWatchLogic",
  "exitSidewaysToFreeWorkersForStrongCandidates",
] as const satisfies ReadonlyArray<keyof SlowTradingAccountTradingConfig>;

const NUMBER_KEYS = [
  "exactLeverage",
  "maxEntryBased24HourVolPct",
  "maxEntryMargin",
  "maxEntryMarginPct",
  "maxLeverage",
  "maxOpenPositions",
  "minActionableAbsoluteLevel",
  "watchMaxNextAveragingLevels",
  "watchReserveLevels",
  "watchReservePctAlloc",
] as const satisfies ReadonlyArray<keyof SlowTradingAccountTradingConfig>;

const ALLOWED_KEYS = new Set<keyof SlowTradingAccountTradingConfig>([
  "adaptiveAveraging",
  ...BOOLEAN_KEYS,
  ...NUMBER_KEYS,
  "notes",
  "modelConfig",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`"${field}" must be a finite number.`);
  }
}

/** Serializes one account's non-sensitive Trading-tab configuration. */
function stringify(config: SlowTradingAccountTradingConfig): string {
  return JSON.stringify(config, null, 2);
}

/** Parses the complete Trading-tab configuration copied from another account. */
function parse(raw: string): SlowTradingAccountTradingConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The Trading configuration is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("The Trading configuration must be a JSON object.");
  }

  const unknownKey = Object.keys(parsed).find(
    (key) => !ALLOWED_KEYS.has(key as keyof SlowTradingAccountTradingConfig),
  );
  if (unknownKey) {
    throw new Error(`Unknown Trading configuration field: "${unknownKey}".`);
  }

  if (typeof parsed.notes !== "string") {
    throw new Error('"notes" must be a string.');
  }
  if (!isRecord(parsed.modelConfig)) {
    throw new Error('"modelConfig" must be a JSON object.');
  }

  for (const key of BOOLEAN_KEYS) {
    const value = parsed[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`"${key}" must be true or false.`);
    }
  }

  for (const key of NUMBER_KEYS) {
    const value = parsed[key];
    if (value !== undefined) {
      requireFiniteNumber(value, key);
    }
  }

  if (parsed.adaptiveAveraging !== undefined) {
    if (!isRecord(parsed.adaptiveAveraging)) {
      throw new Error('"adaptiveAveraging" must be a JSON object.');
    }
    if (typeof parsed.adaptiveAveraging.enabled !== "boolean") {
      throw new Error('"adaptiveAveraging.enabled" must be true or false.');
    }
    requireFiniteNumber(
      parsed.adaptiveAveraging.maxMultiplier,
      "adaptiveAveraging.maxMultiplier",
    );
    requireFiniteNumber(
      parsed.adaptiveAveraging.minProjectedProfitPct,
      "adaptiveAveraging.minProjectedProfitPct",
    );
  }

  return structuredClone(parsed) as unknown as SlowTradingAccountTradingConfig;
}

const tradingConfigJson = {
  parse,
  stringify,
} as const;

export default tradingConfigJson;
