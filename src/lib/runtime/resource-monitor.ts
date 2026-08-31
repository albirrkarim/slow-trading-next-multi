import { notif, type NotificationChannel } from "@/lib/notification";
import { readFile } from "node:fs/promises";

const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_WARNING_MB = 300;
const DEFAULT_DANGER_MB = 430;
const CHECK_INTERVAL_MS = 15_000;
const ALERT_COOLDOWN_MS = 30 * 60_000;
const WARNING_CONFIRMATION_SAMPLES = 2;
const CGROUP_CURRENT_PATHS = [
  "/sys/fs/cgroup/memory.current",
  "/sys/fs/cgroup/memory/memory.usage_in_bytes",
];
const CGROUP_LIMIT_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
];

type MemoryLevel = "normal" | "warning" | "danger";

type MemoryMonitorConfig = {
  channels: NotificationChannel[];
  dangerMb: number;
  enabled: boolean;
  warningMb: number;
};

type MemorySample = {
  heapUsedMb: number;
  limitMb?: number;
  rssMb: number;
  source: "cgroup" | "process";
  usedMb: number;
};

type MemoryAlert = {
  config: MemoryMonitorConfig;
  level: MemoryLevel;
  previousLevel: MemoryLevel;
  sample: MemorySample;
  t: number;
};

type MemoryMonitorDependencies = {
  config?: () => MemoryMonitorConfig;
  now?: () => number;
  notify?: (alert: MemoryAlert) => Promise<void>;
  read?: () => Promise<MemorySample>;
};

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseChannels(value: unknown): NotificationChannel[] {
  const channels = String(value ?? "telegram,email")
    .split(",")
    .map((channel) => channel.trim().toLowerCase())
    .filter(
      (channel): channel is NotificationChannel =>
        channel === "telegram" || channel === "email",
    );

  return Array.from(new Set(channels));
}

/** Resolves runtime-only memory thresholds without loading trading state. */
function loadConfig(
  env: Record<string, string | undefined> = process.env,
): MemoryMonitorConfig {
  const warningMb = parsePositiveNumber(
    env.MEMORY_MONITOR_WARNING_MB,
    DEFAULT_WARNING_MB,
  );
  const configuredDangerMb = parsePositiveNumber(
    env.MEMORY_MONITOR_DANGER_MB,
    DEFAULT_DANGER_MB,
  );

  return {
    channels: parseChannels(env.MEMORY_MONITOR_NOTIFICATION_CHANNELS),
    dangerMb: Math.max(warningMb + 1, configuredDangerMb),
    enabled:
      env.NODE_ENV === "production" &&
      env.MEMORY_MONITOR_DISABLED !== "1" &&
      env.MEMORY_MONITOR_DISABLED !== "true",
    warningMb,
  };
}

async function readNumericFile(paths: string[]): Promise<number | undefined> {
  for (const file of paths) {
    try {
      const raw = (await readFile(file, "utf8")).trim();
      if (raw === "max") return undefined;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) return value;
    } catch {
      // Try the next cgroup layout before falling back to process RSS.
    }
  }

  return undefined;
}

/** Reads container RAM on Railway and process RSS on non-cgroup systems. */
async function readMemory(): Promise<MemorySample> {
  const processMemory = process.memoryUsage();
  const [containerBytes, rawLimitBytes] = await Promise.all([
    readNumericFile(CGROUP_CURRENT_PATHS),
    readNumericFile(CGROUP_LIMIT_PATHS),
  ]);
  const usedBytes = containerBytes ?? processMemory.rss;
  const limitBytes =
    rawLimitBytes && rawLimitBytes < Number.MAX_SAFE_INTEGER
      ? rawLimitBytes
      : undefined;

  return {
    heapUsedMb: processMemory.heapUsed / BYTES_PER_MB,
    ...(limitBytes && { limitMb: limitBytes / BYTES_PER_MB }),
    rssMb: processMemory.rss / BYTES_PER_MB,
    source: containerBytes === undefined ? "process" : "cgroup",
    usedMb: usedBytes / BYTES_PER_MB,
  };
}

/** Classifies one memory sample using the configured absolute MB thresholds. */
function classify(
  usedMb: number,
  config: Pick<MemoryMonitorConfig, "dangerMb" | "warningMb">,
): MemoryLevel {
  if (usedMb >= config.dangerMb) return "danger";
  if (usedMb >= config.warningMb) return "warning";
  return "normal";
}

function formatMb(value: number | undefined): string {
  return value === undefined ? "unknown" : `${value.toFixed(0)} MB`;
}

/** Builds the compact payload used by every resource-monitor channel. */
function formatAlert(alert: MemoryAlert) {
  const stateLabel =
    alert.level === "normal" ? "RECOVERED" : alert.level.toUpperCase();
  return {
    body: "",
    subject: `[RAM ${stateLabel}] ${alert.sample.usedMb.toFixed(0)} MB / ${formatMb(alert.sample.limitMb)}`,
  };
}

async function sendAlert(alert: MemoryAlert): Promise<void> {
  const payload = formatAlert(alert);

  await Promise.all(
    alert.config.channels.map(async (channel) => {
      try {
        await notif.send(payload, [channel]);
      } catch (error) {
        console.error(`[resource-monitor] failed to notify ${channel}`, error);
      }
    }),
  );
}

/** Creates an isolated monitor so tests can inject memory and notification I/O. */
function createMonitor(dependencies: MemoryMonitorDependencies = {}) {
  const getConfig = dependencies.config ?? loadConfig;
  const getNow = dependencies.now ?? Date.now;
  const notify = dependencies.notify ?? sendAlert;
  const read = dependencies.read ?? readMemory;
  let currentLevel: MemoryLevel = "normal";
  let alertedLevel: MemoryLevel = "normal";
  let warningSamples = 0;
  const lastAlertAt: Partial<Record<Exclude<MemoryLevel, "normal">, number>> =
    {};
  let timer: NodeJS.Timeout | undefined;
  let checking: Promise<void> | undefined;

  const checkNow = async () => {
    if (checking) return checking;

    checking = (async () => {
      const config = getConfig();
      if (!config.enabled) return;

      const sample = await read();
      const rawLevel = classify(sample.usedMb, config);
      warningSamples = rawLevel === "warning" ? warningSamples + 1 : 0;
      const nextLevel =
        rawLevel === "warning" &&
        warningSamples < WARNING_CONFIRMATION_SAMPLES
          ? currentLevel
          : rawLevel;
      const now = getNow();
      const transitioned = nextLevel !== currentLevel;
      const previousLevel = currentLevel;
      currentLevel = nextLevel;

      if (nextLevel === "normal") {
        if (!transitioned || alertedLevel === "normal") return;
        alertedLevel = "normal";
        await notify({ config, level: nextLevel, previousLevel, sample, t: now });
        return;
      }

      const previousAlertAt = lastAlertAt[nextLevel];
      const cooldownElapsed =
        previousAlertAt === undefined ||
        now - previousAlertAt >= ALERT_COOLDOWN_MS;
      const shouldNotify =
        cooldownElapsed || (nextLevel === "danger" && transitioned);

      if (!shouldNotify) return;

      lastAlertAt[nextLevel] = now;
      alertedLevel = nextLevel;
      await notify({ config, level: nextLevel, previousLevel, sample, t: now });
    })().finally(() => {
      checking = undefined;
    });

    return checking;
  };

  const start = () => {
    if (timer || !getConfig().enabled) return;

    // PROD:RUNTIME_MEMORY_MONITOR
    timer = setInterval(() => {
      void checkNow().catch((error) => {
        console.error("[resource-monitor] memory check failed", error);
      });
    }, CHECK_INTERVAL_MS);
    timer.unref();
    void checkNow().catch((error) => {
      console.error("[resource-monitor] initial memory check failed", error);
    });
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  return {
    lifecycle: { start, stop },
    monitor: { checkNow },
    status: {
      get level() {
        return currentLevel;
      },
    },
  } as const;
}

const globalForResourceMonitor = globalThis as typeof globalThis & {
  runtimeResourceMonitor?: ReturnType<typeof createMonitor>;
};
const monitor =
  globalForResourceMonitor.runtimeResourceMonitor ?? createMonitor();
globalForResourceMonitor.runtimeResourceMonitor = monitor;

const resourceMonitor = {
  alert: { format: formatAlert },
  config: { load: loadConfig },
  factory: { create: createMonitor },
  lifecycle: monitor.lifecycle,
  memory: { classify, read: readMemory },
  monitor: monitor.monitor,
  status: monitor.status,
} as const;

export default resourceMonitor;
