import os from "os";
import path from "path";

const DEFAULT_INSTANCE_ID = "3010";
const DEFAULT_RAILWAY_STORAGE_ROOT =
  `/storage/persistent/instances/${DEFAULT_INSTANCE_ID}`;
const DEFAULT_LOCAL_STORAGE_ROOT =
  `storage/persistent/instances/${DEFAULT_INSTANCE_ID}`;
const DEFAULT_TEST_STORAGE_ROOT = path.join(
  os.tmpdir(),
  `slow-trading-next-vitest-${process.pid}`,
);

export function resolveLocalProjectRoot() {
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  const normalizedCwd = path.normalize(cwd);

  if (
    path.basename(normalizedCwd) === "standalone" &&
    path.basename(path.dirname(normalizedCwd)) === ".next"
  ) {
    return path.resolve(normalizedCwd, "../..");
  }

  return normalizedCwd;
}

export function resolvePersistentStorageRoot() {
  const configuredRoot = process.env.PERSISTENT_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    if (path.isAbsolute(configuredRoot)) {
      return configuredRoot;
    }

    return path.resolve(resolveLocalProjectRoot(), configuredRoot);
  }

  if (process.env.VITEST) {
    return DEFAULT_TEST_STORAGE_ROOT;
  }

  if (process.env.RAILWAY_ENVIRONMENT) {
    return DEFAULT_RAILWAY_STORAGE_ROOT;
  }

  return path.resolve(resolveLocalProjectRoot(), DEFAULT_LOCAL_STORAGE_ROOT);
}
