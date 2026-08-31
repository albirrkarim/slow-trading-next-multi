import { FILES } from "@/components/storage";
import {
  createNotificationTypeConfig,
  normalizeHighVolatilityMinAbsoluteLevel,
  normalizeLongOpenPositionHour,
  normalizeStalePositionHour,
  SLOW_NOTIFICATION_KEYS,
  type NotificationTypeConfig,
  type SlowNotificationKey,
} from "@/lib/notification/config";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

interface AlterNotificationResult {
  changed: boolean;
  config: boolean;
  memory: boolean;
}

function pickBooleanParam(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationKey(value: unknown): value is SlowNotificationKey {
  return SLOW_NOTIFICATION_KEYS.includes(value as SlowNotificationKey);
}

function migrateType(
  value: unknown,
  legacyHighVolatilityLevel: number,
): NotificationTypeConfig | undefined {
  const id = typeof value === "string" ? value : isRecord(value) ? value.id : "";
  if (!isNotificationKey(id)) {
    return undefined;
  }

  const defaults = createNotificationTypeConfig(id);
  if (!isRecord(value) || !isRecord(value.params)) {
    if (id === "NOTIF_HIGH_VOLATILITY") {
      return { id, params: { level: legacyHighVolatilityLevel } };
    }

    return defaults;
  }

  if (id === "NOTIF_HIGH_VOLATILITY") {
    return {
      id,
      params: {
        level: normalizeHighVolatilityMinAbsoluteLevel(value.params.level),
      },
    };
  }

  if (id === "NOTIF_STALE_POSITION") {
    return {
      id,
      params: { hour: normalizeStalePositionHour(value.params.hour) },
    };
  }

  if (id === "NOTIF_LONG_OPEN_POSITION") {
    return {
      id,
      params: {
        hour: normalizeLongOpenPositionHour(value.params.hour),
      },
    };
  }

  return { id };
}

function migrateRoute(
  value: unknown,
  legacyHighVolatilityLevel: number,
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const types = Array.isArray(value.types)
    ? Array.from(
        new Map(
          value.types
            .map((item) => migrateType(item, legacyHighVolatilityLevel))
            .filter((item): item is NotificationTypeConfig => Boolean(item))
            .map((item) => [item.id, item]),
        ).values(),
      )
    : value.types;

  return { ...value, types };
}

/** Converts one notification config from string types to rich route types. */
export function migrateNotificationConfig(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const legacyHighVolatilityLevel =
    normalizeHighVolatilityMinAbsoluteLevel(
      value.highVolatilityMinAbsoluteLevel,
    );
  const {
    highVolatilityMinAbsoluteLevel: _legacyLevel,
    ...notification
  } = value;

  return {
    ...notification,
    telegram: migrateRoute(
      notification.telegram,
      legacyHighVolatilityLevel,
    ),
    email: migrateRoute(notification.email, legacyHighVolatilityLevel),
  };
}

function migrateHighVolatilityState(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (isRecord(value.telegram) || isRecord(value.email)) {
    return value;
  }

  return {
    telegram: { ...value },
    email: { ...value },
  };
}

/** Converts persisted mode notification state to per-channel state. */
export function migrateNotificationMemory(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.modes)) {
    return value;
  }

  const modes = Object.fromEntries(
    Object.entries(value.modes).map(([mode, modeState]) => {
      if (!isRecord(modeState)) {
        return [mode, modeState];
      }

      return [
        mode,
        {
          ...modeState,
          highVolatilityNotificationState: migrateHighVolatilityState(
            modeState.highVolatilityNotificationState,
          ),
        },
      ];
    }),
  );

  return { ...value, modes };
}

async function writeCompactJson(file: string, value: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(file));
  const temporaryFile = `${file}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(value));
  await fs.move(temporaryFile, file, { overwrite: true });
}

async function migrateFile(params: {
  file: string;
  dryRun: boolean;
  migrate: (value: unknown) => unknown;
}): Promise<boolean> {
  if (!(await fs.pathExists(params.file))) {
    return false;
  }

  const current = await fs.readJSON(params.file);
  const migrated = params.migrate(current);
  const changed = JSON.stringify(current) !== JSON.stringify(migrated);

  if (changed && !params.dryRun) {
    await writeCompactJson(params.file, migrated);
  }

  return changed;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AlterNotificationResult & { dryRun: boolean }>,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end();
    return;
  }

  const params = req.method === "GET" ? req.query : req.body;
  const dryRun = pickBooleanParam(params.dryRun);
  const config = await migrateFile({
    file: FILES.slow.config,
    dryRun,
    migrate: (value) => {
      if (!isRecord(value) || !isRecord(value.runtime)) {
        return value;
      }

      return {
        ...value,
        runtime: {
          ...value.runtime,
          notification: migrateNotificationConfig(
            value.runtime.notification,
          ),
        },
      };
    },
  });
  const memory = await migrateFile({
    file: FILES.slow.memory,
    dryRun,
    migrate: migrateNotificationMemory,
  });

  res.json({
    dryRun,
    changed: config || memory,
    config,
    memory,
  });
}
