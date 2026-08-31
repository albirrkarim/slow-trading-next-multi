import type { VolatilityPoint } from "@/lib/dynamic";
import type { SlowTradingModeState } from "@/lib/slowTrading/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

const mocks = vi.hoisted(() => ({
  central: vi.fn(async () => undefined),
}));

vi.mock("@/lib/trading", () => ({
  default: {
    notif: {
      central: mocks.central,
    },
  },
}));

function point(level: number, id: string): VolatilityPoint {
  return {
    id,
    l: level > 0 ? "T" : "B",
    lvl: level,
    p: 100,
    pct: 7,
    t: Date.UTC(2026, 6, 4),
    vb: 0,
    vq: 0,
  };
}

describe("slow trading notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses rich configurable monitoring notification types", async () => {
    const {
      SLOW_NOTIFICATION_TYPE_INFO,
      createDefaultDashboardNotificationConfig,
      normalizeDashboardNotificationConfig,
    } = await import("@/lib/notification/config");
    const config = createDefaultDashboardNotificationConfig("SLOW");

    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_HIGH_VOLATILITY",
      params: { level: 3 },
    });
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_STALE_POSITION",
      params: { hour: 1 },
    });
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_LONG_OPEN_POSITION",
      params: { hour: 24 },
    });
    expect(config.telegram.types).toContainEqual({
      id: "NOTIF_MANAGEMENT_ACTION",
      params: { add: true, remove: true },
    });
    expect(SLOW_NOTIFICATION_TYPE_INFO.NOTIF_HIGH_VOLATILITY.label).toBe(
      "High Volatility",
    );
    expect(SLOW_NOTIFICATION_TYPE_INFO.NOTIF_STALE_POSITION.label).toBe(
      "Stale Position",
    );
    expect(SLOW_NOTIFICATION_TYPE_INFO.NOTIF_LONG_OPEN_POSITION.label).toBe(
      "Long Open Position",
    );
    expect(SLOW_NOTIFICATION_TYPE_INFO.NOTIF_MANAGEMENT_ACTION.label).toBe(
      "Management Action",
    );
    expect(
      normalizeDashboardNotificationConfig(
        {
          telegram: {
            enabled: true,
            types: [{ id: "NOTIF_MANAGEMENT_ACTION", params: { add: false } }],
          },
        },
        "SLOW",
      ).telegram.types,
    ).toContainEqual({
      id: "NOTIF_MANAGEMENT_ACTION",
      params: { add: false, remove: true },
    });
  });

  it("filters management additions and removals independently per channel", async () => {
    const { createDefaultDashboardNotificationConfig } = await import(
      "@/lib/notification/config"
    );
    const {
      buildSlowTradingManagementActions,
      notifySlowTradingManagementActions,
    } = await import("@/lib/slowTrading/notifications");
    const notification = createDefaultDashboardNotificationConfig("SLOW");
    notification.email.enabled = true;
    notification.telegram.types.find(
      (item) => item.id === "NOTIF_MANAGEMENT_ACTION",
    )!.params = { add: false, remove: true };
    notification.email.types.find(
      (item) => item.id === "NOTIF_MANAGEMENT_ACTION",
    )!.params = { add: true, remove: false };
    const actions = buildSlowTradingManagementActions({
      previousSymbols: ["SUI", "AAVE"],
      nextSymbols: ["AAVE", "iotx"],
      reason: "Coin Management test update.",
      source: "test.coin-management",
      t: Date.UTC(2026, 7, 9),
    });

    expect(actions).toMatchObject([
      { action: "add", symbol: "IOTX" },
      { action: "remove", symbol: "SUI" },
    ]);

    await notifySlowTradingManagementActions({ actions, notification });

    expect(mocks.central).toHaveBeenCalledTimes(2);
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        key: "NOTIF_MANAGEMENT_ACTION",
        title: "[MANAGEMENT] ADD IOTX",
        message: expect.stringMatching(
          /Action: ADD[\s\S]*Source: test.coin-management[\s\S]*Reason: Coin Management test update\./,
        ),
      }),
    );
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        // PROD:NOTIF_MANAGEMENT_ACTION
        channel: "telegram",
        key: "NOTIF_MANAGEMENT_ACTION",
        title: "[MANAGEMENT] REMOVE SUI",
      }),
    );
  });

  it("notifies at the configured absolute level and resets below it", async () => {
    const { createDefaultDashboardNotificationConfig } = await import(
      "@/lib/notification/config"
    );
    const { notifyHighVolatilityLevels } = await import(
      "@/lib/slowTrading/notifications"
    );
    const modeState = {} as SlowTradingModeState;
    const notification = createDefaultDashboardNotificationConfig("SLOW");
    const highVolatility = notification.telegram.types.find(
      (item) => item.id === "NOTIF_HIGH_VOLATILITY",
    )!;
    highVolatility.params = { level: 6 };

    await notifyHighVolatilityLevels({
      exchangeType: "binance",
      modeState,
      notification,
      volatilityPointsMap: { SOL: [point(6, "level-6-a")] },
    });

    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        // PROD:NOTIF_HIGH_VOLATILITY
        channel: "telegram",
        key: "NOTIF_HIGH_VOLATILITY",
        title: "[VOL] SOL level 6 T",
        message: expect.stringContaining("Threshold: abs(level) >= 6"),
      }),
    );
    expect(modeState.highVolatilityNotificationState).toEqual({
      email: {},
      telegram: { SOL: "POSITIVE" },
    });

    mocks.central.mockClear();
    await notifyHighVolatilityLevels({
      exchangeType: "binance",
      modeState,
      notification,
      volatilityPointsMap: { SOL: [point(7, "level-7")] },
    });
    expect(mocks.central).not.toHaveBeenCalledWith(
      expect.objectContaining({
        key: "NOTIF_HIGH_VOLATILITY",
      }),
    );

    await notifyHighVolatilityLevels({
      exchangeType: "binance",
      modeState,
      notification,
      volatilityPointsMap: { SOL: [point(5, "level-5")] },
    });
    expect(modeState.highVolatilityNotificationState).toEqual({
      email: {},
      telegram: {},
    });

    mocks.central.mockClear();
    await notifyHighVolatilityLevels({
      exchangeType: "binance",
      modeState,
      notification,
      volatilityPointsMap: { SOL: [point(-6, "level-6-b")] },
    });
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "NOTIF_HIGH_VOLATILITY",
        title: "[VOL] SOL level -6 B",
      }),
    );
    expect(modeState.highVolatilityNotificationState).toEqual({
      email: {},
      telegram: { SOL: "NEGATIVE" },
    });
  });

  it("notifies strictly after one hour from the first target vPoint", async () => {
    const { createDefaultDashboardNotificationConfig } = await import(
      "@/lib/notification/config"
    );
    const {
      notifyStalePositions,
      STALE_POSITION_THRESHOLD_MS,
    } = await import("@/lib/slowTrading/notifications");
    const targetTime = Date.UTC(2026, 6, 4, 2);
    const volatilityPoints = [
      {
        id: "entry-t1",
        l: "T",
        lvl: 1,
        p: 100,
        pct: 2,
        t: targetTime - 2_000,
        vb: 0,
        vq: 0,
      },
      {
        id: "adverse-t2",
        l: "T",
        lvl: 2,
        p: 102,
        pct: 3,
        t: targetTime - 1_000,
        vb: 0,
        vq: 0,
      },
      {
        id: "target-b0",
        l: "B",
        lvl: 0,
        p: 99,
        pct: 2,
        t: targetTime,
        vb: 0,
        vq: 0,
      },
      {
        id: "rebound-t1",
        l: "T",
        lvl: 1,
        p: 101,
        pct: 2,
        t: targetTime + 1_000,
        vb: 0,
        vq: 0,
      },
      {
        id: "current-t2",
        l: "T",
        lvl: 2,
        p: 103,
        pct: 3,
        t: targetTime + 2_000,
        vb: 0,
        vq: 0,
      },
    ] as VolatilityPoint[];
    const notification = createDefaultDashboardNotificationConfig("SLOW");
    const input = {
      positions: [
        createTestPosition({
          direction: "SHORT",
          entryTime: targetTime - 3_000,
          symbol: "LIT",
        }),
      ],
      volatilityPointsMap: { LIT: volatilityPoints },
      exchangeType: "binance" as const,
      mode: "sandbox" as const,
      notification,
    };

    await notifyStalePositions({
      ...input,
      currentTimeMs: targetTime + STALE_POSITION_THRESHOLD_MS,
    });
    expect(mocks.central).not.toHaveBeenCalled();

    await notifyStalePositions({
      ...input,
      currentTimeMs: targetTime + STALE_POSITION_THRESHOLD_MS + 1,
    });

    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        // PROD:NOTIF_STALE_POSITION
        channel: "telegram",
        key: "NOTIF_STALE_POSITION",
        dedupeKey: expect.stringContaining("target-b0"),
        title: "[SANDBOX] [STALE POSITION] LIT SHORT",
        message: expect.stringMatching(
          /Target vPoint: B0[\s\S]*Current vPoint: T2/,
        ),
      }),
    );
  });

  it("notifies strictly after the configured hours from position entry", async () => {
    const { createDefaultDashboardNotificationConfig } = await import(
      "@/lib/notification/config"
    );
    const {
      LONG_OPEN_POSITION_THRESHOLD_MS,
      notifyLongOpenPositions,
    } = await import("@/lib/slowTrading/notifications");
    const entryTime = Date.UTC(2026, 6, 4, 2);
    const notification = createDefaultDashboardNotificationConfig("SLOW");
    notification.email.enabled = true;
    notification.email.types.find(
      (item) => item.id === "NOTIF_LONG_OPEN_POSITION",
    )!.params = { hour: 48 };
    const input = {
      exchangeType: "binance" as const,
      mode: "sandbox" as const,
      notification,
      positions: [
        createTestPosition({
          direction: "SHORT",
          entryId: "entry-lit-1",
          entryTime,
          marginUsdt: 20,
          symbol: "LIT",
        }),
      ],
    };

    await notifyLongOpenPositions({
      ...input,
      currentTimeMs: entryTime + LONG_OPEN_POSITION_THRESHOLD_MS,
    });
    expect(mocks.central).not.toHaveBeenCalled();

    await notifyLongOpenPositions({
      ...input,
      currentTimeMs: entryTime + LONG_OPEN_POSITION_THRESHOLD_MS + 1,
    });

    expect(mocks.central).toHaveBeenCalledTimes(1);
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        // PROD:NOTIF_LONG_OPEN_POSITION
        channel: "telegram",
        key: "NOTIF_LONG_OPEN_POSITION",
        dedupeKey: expect.stringContaining("entry-lit-1"),
        title: "[SANDBOX] [LONG OPEN POSITION] LIT SHORT",
        message: expect.stringMatching(
          /Threshold: more than 24 hours[\s\S]*Open for: 24.00 hours[\s\S]*Margin: \$20.00/,
        ),
      }),
    );
  });

  it("evaluates notification parameters independently for each channel", async () => {
    const { createDefaultDashboardNotificationConfig } = await import(
      "@/lib/notification/config"
    );
    const {
      notifyHighVolatilityLevels,
      notifyStalePositions,
      STALE_POSITION_THRESHOLD_MS,
    } = await import("@/lib/slowTrading/notifications");
    const notification = createDefaultDashboardNotificationConfig("SLOW");
    notification.email.enabled = true;

    notification.telegram.types.find(
      (item) => item.id === "NOTIF_HIGH_VOLATILITY",
    )!.params = { level: 4 };
    notification.email.types.find(
      (item) => item.id === "NOTIF_HIGH_VOLATILITY",
    )!.params = { level: 6 };
    notification.telegram.types.find(
      (item) => item.id === "NOTIF_STALE_POSITION",
    )!.params = { hour: 1 };
    notification.email.types.find(
      (item) => item.id === "NOTIF_STALE_POSITION",
    )!.params = { hour: 2 };

    await notifyHighVolatilityLevels({
      exchangeType: "binance",
      modeState: {} as SlowTradingModeState,
      notification,
      volatilityPointsMap: { SOL: [point(5, "level-5")] },
    });

    expect(mocks.central).toHaveBeenCalledTimes(1);
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        key: "NOTIF_HIGH_VOLATILITY",
      }),
    );

    mocks.central.mockClear();
    const targetTime = Date.UTC(2026, 6, 4, 2);
    await notifyStalePositions({
      currentTimeMs:
        targetTime + STALE_POSITION_THRESHOLD_MS + 30 * 60 * 1000,
      exchangeType: "binance",
      mode: "live",
      notification,
      positions: [
        createTestPosition({
          direction: "LONG",
          entryTime: targetTime - 1,
          symbol: "SOL",
        }),
      ],
      volatilityPointsMap: {
        SOL: [
          {
            ...point(1, "target-t1"),
            t: targetTime,
          },
        ],
      },
    });

    expect(mocks.central).toHaveBeenCalledTimes(1);
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        key: "NOTIF_STALE_POSITION",
      }),
    );
  });
});
