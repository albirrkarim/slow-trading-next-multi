import fs from "fs-extra";
import path from "path";

import { resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";

const DEFAULT_ONLINE_BASE_URL = "https://fast.reinventwp.com";
const SYNC_BACKUP_SUFFIX = "-sync-backups";

export interface PersistentStorageExportFile {
  contentBase64: string;
  path: string;
}

export interface PersistentStorageExportBundle {
  directories: string[];
  exportedAt: string;
  files: PersistentStorageExportFile[];
  rootName: string;
  schemaVersion: 1;
}

export interface PersistentStorageImportResult {
  backupPath: string | null;
  directoriesImported: number;
  filesImported: number;
  storageRoot: string;
}

function normalizeRelativePath(input: string): string {
  const normalized = path.posix.normalize(
    String(input || "").replace(/\\/g, "/"),
  );

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe storage bundle path: ${input}`);
  }

  return normalized;
}

function toBundlePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function walkPersistentStorage(root: string) {
  const files: string[] = [];
  const directories: string[] = [];

  if (!(await fs.pathExists(root))) {
    return { directories, files };
  }

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        directories.push(toBundlePath(root, fullPath));
        await walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);

  return { directories, files };
}

function getSyncBackupRoot(storageRoot: string) {
  return path.join(
    path.dirname(storageRoot),
    `${path.basename(storageRoot)}${SYNC_BACKUP_SUFFIX}`,
  );
}

function makeTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function makeBackupPath(storageRoot: string, stamp = makeTimestamp()) {
  return path.join(getSyncBackupRoot(storageRoot), stamp);
}

function makeStagingPath(storageRoot: string, stamp = makeTimestamp()) {
  return path.join(
    path.dirname(storageRoot),
    `${path.basename(storageRoot)}-sync-staging-${stamp}`,
  );
}

export function isLocalPersistentStorageSyncAllowed(host?: string | null) {
  if (process.env.RAILWAY_ENVIRONMENT) {
    return false;
  }

  const normalizedHost = String(host || "").toLowerCase();
  return (
    normalizedHost.startsWith("localhost") ||
    normalizedHost.startsWith("127.0.0.1") ||
    normalizedHost.startsWith("[::1]") ||
    normalizedHost.startsWith("::1")
  );
}

export function isLocalAppName(appName = process.env.APP_NAME) {
  return String(appName ?? "").trim().toLocaleLowerCase() === "localhost";
}

export function isLocalCoinMetadataManualSyncAllowed(host?: string | null) {
  return isLocalAppName() && isLocalPersistentStorageSyncAllowed(host);
}

export function getOnlinePersistentStorageExportUrl(baseUrl?: string) {
  const source =
    baseUrl?.trim() ||
    process.env.SLOW_SYNC_ONLINE_BASE_URL?.trim() ||
    DEFAULT_ONLINE_BASE_URL;
  return new URL("/api/slow-trading/debug/export", source).toString();
}

export async function exportPersistentStorageBundle(
  storageRoot = resolvePersistentStorageRoot(),
): Promise<PersistentStorageExportBundle> {
  const { directories, files } = await walkPersistentStorage(storageRoot);
  const bundleFiles: PersistentStorageExportFile[] = [];

  for (const file of files) {
    bundleFiles.push({
      path: toBundlePath(storageRoot, file),
      contentBase64: (await fs.readFile(file)).toString("base64"),
    });
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    rootName: path.basename(storageRoot),
    directories: directories.sort(),
    files: bundleFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function importPersistentStorageBundle(
  bundle: PersistentStorageExportBundle,
  storageRoot = resolvePersistentStorageRoot(),
): Promise<PersistentStorageImportResult> {
  if (bundle?.schemaVersion !== 1 || !Array.isArray(bundle.files)) {
    throw new Error("Invalid persistent storage export bundle");
  }

  const stamp = makeTimestamp();
  const stagingPath = makeStagingPath(storageRoot, stamp);
  let backupPath: string | null = null;

  try {
    await fs.remove(stagingPath);
    await fs.ensureDir(stagingPath);

    for (const directory of bundle.directories ?? []) {
      const relativePath = normalizeRelativePath(directory);
      await fs.ensureDir(path.join(stagingPath, relativePath));
    }

    for (const file of bundle.files) {
      const relativePath = normalizeRelativePath(file.path);
      const targetPath = path.join(stagingPath, relativePath);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, Buffer.from(file.contentBase64, "base64"));
    }

    if (await fs.pathExists(storageRoot)) {
      backupPath = makeBackupPath(storageRoot, stamp);
      await fs.ensureDir(path.dirname(backupPath));
      await fs.copy(storageRoot, backupPath, {
        overwrite: false,
        errorOnExist: true,
      });
      await fs.remove(storageRoot);
    }

    await fs.move(stagingPath, storageRoot, {
      overwrite: false,
    });

    return {
      backupPath,
      directoriesImported: bundle.directories?.length ?? 0,
      filesImported: bundle.files.length,
      storageRoot,
    };
  } catch (error) {
    await fs.remove(stagingPath).catch(() => undefined);
    throw error;
  }
}

export async function fetchOnlinePersistentStorageBundle(
  params: {
    onlineBaseUrl?: string;
    token?: string;
  } = {},
) {
  const response = await fetch(
    getOnlinePersistentStorageExportUrl(params.onlineBaseUrl),
    {
      headers: params.token
        ? {
            "x-slow-sync-token": params.token,
          }
        : undefined,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Online persistent storage export failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as PersistentStorageExportBundle;
}

export async function syncOnlinePersistentStorageToLocal(
  params: {
    onlineBaseUrl?: string;
    token?: string;
  } = {},
) {
  const bundle = await fetchOnlinePersistentStorageBundle(params);
  return importPersistentStorageBundle(bundle);
}

/**
 * Grouped debug-sync API for persistent storage transfer between servers.
 */
const slowTradingDebugSync = {
  exportPersistentStorageBundle,
  fetchOnlinePersistentStorageBundle,
  getOnlinePersistentStorageExportUrl,
  importPersistentStorageBundle,
  isLocalAppName,
  isLocalCoinMetadataManualSyncAllowed,
  isLocalPersistentStorageSyncAllowed,
  syncOnlinePersistentStorageToLocal,
} as const;

export default slowTradingDebugSync;
export { slowTradingDebugSync };
