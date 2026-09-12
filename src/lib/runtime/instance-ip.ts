import { isIP } from "node:net";

import fs from "fs-extra";

import { FILES } from "@/components/storage";
import { notif } from "@/lib/notification";
import slowTradingJsonFile from "@/lib/slowTrading/storage/json-file";
import { tradeLog } from "@/lib/trading/helper/log";

const IPIFY_URL = "https://api.ipify.org";
const REQUEST_TIMEOUT_MS = 10_000;

export interface InstanceIpSnapshot {
  /** Public IP address reported by ipify. */
  ip: string;
  /** Time of the latest successful check in milliseconds. */
  t: number;
}

function normalizeSnapshot(value: unknown): InstanceIpSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<InstanceIpSnapshot>;
  return typeof candidate.ip === "string" &&
    isIP(candidate.ip) > 0 &&
    typeof candidate.t === "number" &&
    Number.isFinite(candidate.t) &&
    candidate.t > 0
    ? { ip: candidate.ip, t: candidate.t }
    : null;
}

/** Reads the latest successfully checked public IP snapshot. */
async function read(): Promise<InstanceIpSnapshot | null> {
  try {
    if (!(await fs.pathExists(FILES.slow.ip))) {
      return null;
    }

    return normalizeSnapshot(await fs.readJSON(FILES.slow.ip));
  } catch (error) {
    tradeLog.error("[instance-ip] failed to read stored IP", error);
    return null;
  }
}

/** Checks the public IP once during process startup and reports a change. */
async function check(): Promise<InstanceIpSnapshot | null> {
  try {
    const previous = await read();
    const response = await fetch(IPIFY_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`ipify returned HTTP ${response.status}`);
    }

    const ip = (await response.text()).trim();
    if (isIP(ip) === 0) {
      throw new Error("ipify returned an invalid IP address");
    }

    const current = { ip, t: Date.now() } satisfies InstanceIpSnapshot;
    // PROD:INSTANCE_IP_STORAGE
    await slowTradingJsonFile.write.atomic(FILES.slow.ip, current);

    if (previous && previous.ip !== current.ip) {
      // PROD:NOTIF_IP_CHANGED
      await notif.central({
        dashboard: "SLOW",
        key: "NOTIF_IP_CHANGED",
        title: `[IP CHANGED] ${previous.ip} -> ${current.ip}`,
        message: [
          `Previous IP: ${previous.ip}`,
          `Current IP: ${current.ip}`,
          `Last checked: ${new Date(current.t).toISOString()}`,
        ].join("\n"),
        dedupeKey: `instance-ip-change:${previous.ip}:${previous.t}:${current.ip}`,
      });
    }

    return current;
  } catch (error) {
    tradeLog.error("[instance-ip] startup check failed", error);
    return null;
  }
}

const instanceIp = {
  lifecycle: { check },
  storage: { read },
} as const;

export default instanceIp;
