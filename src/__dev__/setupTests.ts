import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterAll } from "vitest";

const testStorageRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "slow-trading-next-vitest-"),
);

// This runs before test modules and hoisted mock factories are evaluated.
process.env.PERSISTENT_STORAGE_ROOT = testStorageRoot;
// Keep dotenv from restoring real Telegram credentials during cycle tests.
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";

afterAll(() => {
  fs.removeSync(testStorageRoot);
});
