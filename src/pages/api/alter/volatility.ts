import { VOLATILITY_FOLDER } from "@/components/api/constants";
import { resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

type CompactVolatilityLabel = "T" | "B";

interface CompactVolatilityPoint {
  id: string;
  t: number;
  l: CompactVolatilityLabel;
  pct: number;
  p: number;
  vb: number;
  vq: number;
  lvl: number;
  [key: string]: unknown;
}

interface AlterVolatilityFileResult {
  file: string;
  pointCount: number;
  status: "converted" | "skipped" | "unchanged" | "error";
  error?: string;
  sizeBefore?: number;
  sizeAfter?: number;
}

const OLD_VOLATILITY_POINT_KEYS = new Set([
  "id",
  "time",
  "timeHuman",
  "symbol",
  "label",
  "percentage",
  "price",
  "volumeBase",
  "volumeQuote",
  "level",
]);

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

function isCompactVolatilityPoint(value: unknown): value is CompactVolatilityPoint {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.t === "number" &&
    (value.l === "T" || value.l === "B") &&
    typeof value.pct === "number" &&
    typeof value.p === "number" &&
    typeof value.vb === "number" &&
    typeof value.vq === "number" &&
    typeof value.lvl === "number"
  );
}

function getCompactLabel(label: unknown): CompactVolatilityLabel | undefined {
  if (label === "T" || label === "TOP") return "T";
  if (label === "B" || label === "BOTTOM") return "B";
  return undefined;
}

/**
 * Converts one persisted volatility point to the compact storage shape.
 */
function compactVolatilityPoint(value: unknown): {
  changed: boolean;
  point?: CompactVolatilityPoint;
} {
  if (isCompactVolatilityPoint(value)) {
    return { changed: false, point: value };
  }

  if (!isRecord(value)) {
    return { changed: false };
  }

  const label = getCompactLabel(value.label ?? value.l);
  const t = Number(value.time ?? value.t);
  const pct = Number(value.percentage ?? value.pct);
  const p = Number(value.price ?? value.p);
  const vb = Number(value.volumeBase ?? value.vb);
  const vq = Number(value.volumeQuote ?? value.vq);
  const lvl = Number(value.level ?? value.lvl);

  if (
    typeof value.id !== "string" ||
    !label ||
    !Number.isFinite(t) ||
    !Number.isFinite(pct) ||
    !Number.isFinite(p) ||
    !Number.isFinite(vb) ||
    !Number.isFinite(vq) ||
    !Number.isFinite(lvl)
  ) {
    return { changed: false };
  }

  const compact: CompactVolatilityPoint = {
    id: value.id,
    t,
    l: label,
    pct,
    p,
    vb,
    vq,
    lvl,
  };

  for (const [key, extraValue] of Object.entries(value)) {
    if (!OLD_VOLATILITY_POINT_KEYS.has(key) && !(key in compact)) {
      compact[key] = extraValue;
    }
  }

  return { changed: true, point: compact };
}

function compactVolatilityPoints(points: unknown[]): {
  changed: boolean;
  points?: CompactVolatilityPoint[];
} {
  const compacted: CompactVolatilityPoint[] = [];
  let changed = false;

  for (const point of points) {
    const result = compactVolatilityPoint(point);
    if (!result.point) {
      return { changed: false };
    }

    compacted.push(result.point);
    changed = changed || result.changed;
  }

  return { changed, points: compacted };
}

function compactVolatilityJson(value: unknown): {
  changed: boolean;
  pointCount: number;
  value?: unknown;
} {
  if (Array.isArray(value)) {
    const result = compactVolatilityPoints(value);
    return {
      changed: result.changed,
      pointCount: result.points?.length ?? 0,
      value: result.points,
    };
  }

  if (isRecord(value) && Array.isArray(value.lastVolatility)) {
    const result = compactVolatilityPoints(value.lastVolatility);
    if (!result.points) {
      return { changed: false, pointCount: 0 };
    }

    return {
      changed: result.changed,
      pointCount: result.points.length,
      value: {
        ...value,
        lastVolatility: result.points,
      },
    };
  }

  return { changed: false, pointCount: 0 };
}

async function listJsonFiles(root: string): Promise<string[]> {
  if (!(await fs.pathExists(root))) {
    return [];
  }

  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function writeCompactJson(file: string, value: unknown) {
  const tempFile = `${file}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(value));
  await fs.move(tempFile, file, { overwrite: true });
}

async function alterVolatilityFile(
  file: string,
  dryRun: boolean,
): Promise<AlterVolatilityFileResult> {
  try {
    const sizeBefore = (await fs.stat(file)).size;
    const json = await fs.readJson(file);
    const compacted = compactVolatilityJson(json);

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

async function getVolatilityRoots() {
  const persistentRoot = resolvePersistentStorageRoot();
  const slowRoot = path.join(persistentRoot, "slow");
  const persistentVolatilityRoots: string[] = [];

  if (await fs.pathExists(slowRoot)) {
    const entries = await fs.readdir(slowRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const volatilityRoot = path.join(slowRoot, entry.name, "volatility");
      if (await fs.pathExists(volatilityRoot)) {
        persistentVolatilityRoots.push(volatilityRoot);
      }
    }
  }

  return [
    path.resolve(VOLATILITY_FOLDER),
    ...persistentVolatilityRoots,
  ];
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
  const roots = await getVolatilityRoots();
  const files = (
    await Promise.all(roots.map((root) => listJsonFiles(root)))
  ).flat();
  const results = await Promise.all(
    files.map((file) => alterVolatilityFile(file, dryRun)),
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
    roots,
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
