import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";

const writeChains = new Map<string, Promise<void>>();

/** Serializes writes to one path within this process. */
function serializeWrite<T>(
  filePath: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = writeChains.get(filePath) ?? Promise.resolve();
  const result = previous.then(write, write);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );

  writeChains.set(filePath, settled);
  void settled.then(() => {
    if (writeChains.get(filePath) === settled) {
      writeChains.delete(filePath);
    }
  });

  return result;
}

/**
 * Replaces one JSON file atomically so readers observe either the previous or
 * complete next payload, never a truncated intermediate file.
 */
async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  await serializeWrite(filePath, async () => {
    await replaceAtomic(filePath, value);
  });
}

async function replaceAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.ensureDir(path.dirname(filePath));

  try {
    await fs.writeJSON(temporaryPath, value);
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.remove(temporaryPath).catch(() => undefined);
  }
}

/** Atomically reads, transforms, and replaces one JSON file. */
async function updateAtomic<T>(
  filePath: string,
  update: (current: unknown) => T | Promise<T>,
): Promise<T> {
  return serializeWrite(filePath, async () => {
    const current = (await fs.pathExists(filePath))
      ? await fs.readJSON(filePath)
      : undefined;
    const next = await update(current);
    await replaceAtomic(filePath, next);
    return next;
  });
}

const slowTradingJsonFile = {
  write: {
    atomic: writeAtomic,
  },
  update: {
    atomic: updateAtomic,
  },
} as const;

export default slowTradingJsonFile;
