import { predictionEngine } from "@/lib/dynamic/utils/volatility/engine";
import type { PredictionEngineMemory } from "@/lib/dynamic/utils/volatility/memory_design";
import type { VolatilityPoint } from "@/lib/dynamic/utils/volatility/volatility";
import { windowsMs } from "@/lib/dynamic/constants-time";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchKlines: vi.fn(async () => []),
  getKlines: vi.fn(async () => []),
}));

vi.mock("@/lib/datasets/fetchKlines", () => ({
  fetchKlinesFunction: mocks.fetchKlines,
}));

vi.mock("@/lib/exchange", () => ({
  getExchange: vi.fn(() => ({
    getKlines: mocks.getKlines,
  })),
}));

vi.mock("@/components/api/utils", () => ({
  delay: vi.fn(async () => undefined),
}));

const now = Date.UTC(2026, 5, 24, 12);

function createMemory(lvl: number, vPointLastUpdate?: number) {
  const point: VolatilityPoint = {
    id: `point-${lvl}`,
    l: "B",
    lvl,
    pct: 5,
    p: 100,
    t: now - windowsMs["1h"],
    vb: 0,
    vq: 0,
  };

  return {
    lastVolatility: [point],
    symbol: "SUI",
    vPointLastUpdate,
  } satisfies PredictionEngineMemory;
}

async function sync(
  memory: PredictionEngineMemory,
  endTime: number,
  minActionableAbsoluteLevel?: number,
) {
  return predictionEngine({
    endTime,
    memory,
    minActionableAbsoluteLevel,
    tradePair: "SUI_USDT",
  });
}

describe("volatility engine level-aware sync throttle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(now);
  });

  it("waits six hours after syncing a level zero point", async () => {
    const memory = createMemory(0, now);

    await sync(memory, now + windowsMs["6h"] - 1);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).not.toHaveBeenCalled();
    expect(mocks.getKlines).not.toHaveBeenCalled();
    expect(memory.vPointLastUpdate).toBe(now);
  });

  it("syncs level zero once six hours have elapsed", async () => {
    const memory = createMemory(0, now);

    await sync(memory, now + windowsMs["6h"]);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.getKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now + windowsMs["6h"]);
  });

  it.each([-1, 1])(
    "waits four hours after syncing level %i",
    async (level) => {
      const memory = createMemory(level, now);

      await sync(memory, now + windowsMs["1h"] * 4 - 1);

      // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
      expect(mocks.fetchKlines).not.toHaveBeenCalled();
      expect(mocks.getKlines).not.toHaveBeenCalled();
      expect(memory.vPointLastUpdate).toBe(now);
    },
  );

  it.each([-1, 1])(
    "syncs level %i once four hours have elapsed",
    async (level) => {
      const memory = createMemory(level, now);

      await sync(memory, now + windowsMs["1h"] * 4);

      // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
      expect(mocks.getKlines).toHaveBeenCalledOnce();
      expect(memory.vPointLastUpdate).toBe(now + windowsMs["1h"] * 4);
    },
  );

  it.each([-2, 2, -3, 3])(
    "does not throttle entry-adjacent level %i",
    async (level) => {
      const memory = createMemory(level, now);

      await sync(memory, now + windowsMs["5min"]);

      // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
      expect(mocks.getKlines).toHaveBeenCalledOnce();
      expect(memory.vPointLastUpdate).toBe(now + windowsMs["5min"]);
    },
  );

  it("uses the normal cycle for level zero when the actionable level is one", async () => {
    const memory = createMemory(0, now);

    await sync(memory, now + windowsMs["5min"], 1);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.getKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now + windowsMs["5min"]);
  });

  it("uses the normal cycle one level below an actionable level of four", async () => {
    const memory = createMemory(3, now);

    await sync(memory, now + windowsMs["5min"], 4);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.getKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now + windowsMs["5min"]);
  });

  it("waits four hours two levels below an actionable level of four", async () => {
    const memory = createMemory(2, now);

    await sync(memory, now + windowsMs["1h"] * 4 - 1, 4);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).not.toHaveBeenCalled();
    expect(mocks.getKlines).not.toHaveBeenCalled();
    expect(memory.vPointLastUpdate).toBe(now);
  });

  it("waits six hours three levels below an actionable level of four", async () => {
    const memory = createMemory(1, now);

    await sync(memory, now + windowsMs["6h"] - 1, 4);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).not.toHaveBeenCalled();
    expect(mocks.getKlines).not.toHaveBeenCalled();
    expect(memory.vPointLastUpdate).toBe(now);
  });

  it("syncs old persisted memory immediately when it has no sync time", async () => {
    const memory = createMemory(0);

    await sync(memory, now);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.getKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now);
  });

  it("waits six hours after syncing an empty volatility memory", async () => {
    const memory = {
      lastVolatility: [],
      symbol: "SUI",
      vPointLastUpdate: now,
    } satisfies PredictionEngineMemory;

    await sync(memory, now + windowsMs["6h"] - 1);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).not.toHaveBeenCalled();
    expect(mocks.getKlines).not.toHaveBeenCalled();
    expect(memory.vPointLastUpdate).toBe(now);
  });

  it("retries an empty volatility memory once six hours have elapsed", async () => {
    const memory = {
      lastVolatility: [],
      symbol: "SUI",
      vPointLastUpdate: now,
    } satisfies PredictionEngineMemory;

    await sync(memory, now + windowsMs["6h"]);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now + windowsMs["6h"]);
  });

  it("syncs empty volatility memory immediately when it has no sync time", async () => {
    const memory: PredictionEngineMemory = {
      lastVolatility: [],
      symbol: "SUI",
    };

    await sync(memory, now);

    // BOTH:VOLATILITY_LEVEL_SYNC_THROTTLE
    expect(mocks.fetchKlines).toHaveBeenCalledOnce();
    expect(memory.vPointLastUpdate).toBe(now);
  });
});
