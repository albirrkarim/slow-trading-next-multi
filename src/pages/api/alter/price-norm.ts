import { resolveLocalProjectRoot, resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

const CURRENT_PRICE_NORM_DECIMALS = 2;

interface CompactPriceNorm {
  t: number;
  x: number;
  n: number;
  c: number;
  [key: string]: unknown;
}

interface AlterPriceNormFileResult {
  file: string;
  pointCount: number;
  status: "converted" | "skipped" | "unchanged" | "error";
  error?: string;
  sizeBefore?: number;
  sizeAfter?: number;
}

const OLD_PRICE_NORM_KEYS = new Set(["time", "max", "min", "current"]);

function pickBooleanParam(value: unknown) {
  if (value === true) return true;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompactPriceNorm(value: unknown): value is CompactPriceNorm {
  return (
    isRecord(value) &&
    typeof value.t === "number" &&
    typeof value.x === "number" &&
    typeof value.n === "number" &&
    typeof value.c === "number"
  );
}

/** Rounds the normalized current price while keeping price bounds precise. */
function roundCurrentPriceNorm(value: number) {
  const factor = 10 ** CURRENT_PRICE_NORM_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Converts one persisted price-norm point to the compact storage shape.
 */
function compactPriceNormPoint(value: unknown): {
  changed: boolean;
  point?: CompactPriceNorm;
} {
  if (isCompactPriceNorm(value)) {
    const rounded = roundCurrentPriceNorm(value.c);
    if (rounded === value.c) {
      return { changed: false, point: value };
    }

    return {
      changed: true,
      point: {
        ...value,
        c: rounded,
      },
    };
  }

  if (!isRecord(value)) {
    return { changed: false };
  }

  const t = Number(value.time ?? value.t);
  const x = Number(value.max ?? value.x);
  const n = Number(value.min ?? value.n);
  const c = Number(value.current ?? value.c);

  if (
    !Number.isFinite(t) ||
    !Number.isFinite(x) ||
    !Number.isFinite(n) ||
    !Number.isFinite(c)
  ) {
    return { changed: false };
  }

  const compact: CompactPriceNorm = { t, x, n, c: roundCurrentPriceNorm(c) };

  for (const [key, extraValue] of Object.entries(value)) {
    if (!OLD_PRICE_NORM_KEYS.has(key) && !(key in compact)) {
      compact[key] = extraValue;
    }
  }

  return { changed: true, point: compact };
}

function compactPriceNormPoints(points: unknown[]): {
  changed: boolean;
  points?: CompactPriceNorm[];
} {
  const compacted: CompactPriceNorm[] = [];
  let changed = false;

  for (const point of points) {
    const result = compactPriceNormPoint(point);
    if (!result.point) {
      return { changed: false };
    }

    compacted.push(result.point);
    changed = changed || result.changed;
  }

  return { changed, points: compacted };
}

function compactPriceNormMap(value: unknown): {
  changed: boolean;
  pointCount: number;
  value?: Record<string, CompactPriceNorm[]>;
} {
  if (!isRecord(value)) {
    return { changed: false, pointCount: 0 };
  }

  const compactedMap: Record<string, CompactPriceNorm[]> = {};
  let changed = false;
  let pointCount = 0;

  for (const [symbol, points] of Object.entries(value)) {
    if (!Array.isArray(points)) {
      return { changed: false, pointCount: 0 };
    }

    const result = compactPriceNormPoints(points);
    if (!result.points) {
      return { changed: false, pointCount: 0 };
    }

    compactedMap[symbol] = result.points;
    changed = changed || result.changed;
    pointCount += result.points.length;
  }

  return { changed, pointCount, value: compactedMap };
}

async function writeCompactJson(file: string, value: unknown) {
  const tempFile = `${file}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(value));
  await fs.move(tempFile, file, { overwrite: true });
}

async function alterPriceNormFile(
  file: string,
  dryRun: boolean,
): Promise<AlterPriceNormFileResult> {
  try {
    const sizeBefore = (await fs.stat(file)).size;
    const json = await fs.readJson(file);
    const compacted = compactPriceNormMap(json);

    if (!compacted.value || compacted.pointCount === 0) {
      return { file, pointCount: 0, status: "skipped", sizeBefore };
    }

    if (!compacted.changed) {
      return {
        file,
        pointCount: compacted.pointCount,
        status: "unchanged",
        sizeBefore,
        sizeAfter: sizeBefore,
      };
    }

    const compactJson = JSON.stringify(compacted.value);
    if (!dryRun) {
      await writeCompactJson(file, compacted.value);
    }

    return {
      file,
      pointCount: compacted.pointCount,
      status: "converted",
      sizeBefore,
      sizeAfter: Buffer.byteLength(compactJson),
    };
  } catch (error) {
    return {
      file,
      pointCount: 0,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getCurrentRootPriceNormFiles() {
  const persistentRoot = resolvePersistentStorageRoot();
  const slowRoot = path.join(persistentRoot, "slow");

  if (!(await fs.pathExists(slowRoot))) {
    return [];
  }

  const entries = await fs.readdir(slowRoot, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const file = path.join(slowRoot, entry.name, "priceNormMapOverTime.json");
    if (await fs.pathExists(file)) {
      files.push(file);
    }
  }

  return files;
}

async function getLocalInstancePriceNormFiles() {
  const instancesRoot = path.join(
    resolveLocalProjectRoot(),
    "storage",
    "persistent",
    "instances",
  );

  if (!(await fs.pathExists(instancesRoot))) {
    return [];
  }

  const instanceEntries = await fs.readdir(instancesRoot, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const instanceEntry of instanceEntries) {
    if (
      !instanceEntry.isDirectory() ||
      instanceEntry.name.includes("sync-backups")
    ) {
      continue;
    }

    const slowRoot = path.join(instancesRoot, instanceEntry.name, "slow");
    if (!(await fs.pathExists(slowRoot))) {
      continue;
    }

    const exchangeEntries = await fs.readdir(slowRoot, { withFileTypes: true });
    for (const exchangeEntry of exchangeEntries) {
      if (!exchangeEntry.isDirectory()) {
        continue;
      }

      const file = path.join(
        slowRoot,
        exchangeEntry.name,
        "priceNormMapOverTime.json",
      );
      if (await fs.pathExists(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

async function getPriceNormFiles() {
  const files = [
    ...(await getCurrentRootPriceNormFiles()),
    ...(await getLocalInstancePriceNormFiles()),
  ];

  return [...new Set(files.map((file) => path.resolve(file)))];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const params = req.method === "GET" ? req.query : req.body;
  const dryRun = pickBooleanParam(params.dryRun);
  const files = await getPriceNormFiles();
  const results = await Promise.all(
    files.map((file) => alterPriceNormFile(file, dryRun)),
  );
  const converted = results.filter((item) => item.status === "converted");
  const totalSizeBefore = converted.reduce(
    (total, item) => total + (item.sizeBefore ?? 0),
    0,
  );
  const totalSizeAfter = converted.reduce(
    (total, item) => total + (item.sizeAfter ?? 0),
    0,
  );

  res.json({
    dryRun,
    files,
    scanned: results.length,
    converted: converted.length,
    unchanged: results.filter((item) => item.status === "unchanged").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    errors: results.filter((item) => item.status === "error").length,
    totalPointsConverted: converted.reduce(
      (total, item) => total + item.pointCount,
      0,
    ),
    totalSizeBefore,
    totalSizeAfter,
    savedBytes: Math.max(0, totalSizeBefore - totalSizeAfter),
    results,
  });
}
