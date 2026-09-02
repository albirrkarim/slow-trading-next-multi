import {
  isCanonicalPosition,
  isPositionMigrationFile,
  migrateLegacyPosition,
  migratePositionJson,
  validateCanonicalPosition,
} from "@/pages/api/alter/position";
import type { Position } from "@/lib/trading/models";
import { describe, expect, it } from "vitest";
import { createTestPosition } from "../fixtures/position";

function createLegacyPosition() {
  return {
    symbol: "KITE",
    entryId: "B_KITE",
    entryPrice: 0.1,
    entryTime: 1_000,
    quantity: 240,
    usdt: 24,
    marginUSDT: 6,
    fee: 0.048,
    entryFeeUSDT: 0.024,
    exitFeeUSDT: 0.024,
    category: "[COMMON]",
    message: "[BUY] KITE common entry",
    executionMode: "sandbox",
    tradingMode: "futures",
    direction: "LONG",
    leverage: 4,
    entryFeature: {
      market: { globalVolatilityIndex: 2 },
      watchState: {
        entryLevel: -1,
        lastHandledLevel: -2,
        reserveBaseMarginUsdt: 6,
        reservedRemainingUsdt: 0,
        reserveSteps: [
          {
            level: -2,
            marginUsdt: 12,
            pctAlloc: 2,
            status: "USED",
          },
        ],
        addPositionTriggers: [
          {
            time: 2_000,
            handledLevel: -2,
            entryNotionalUsdt: 48,
            price: 0.09,
            pctAlloc: 2,
          },
        ],
      },
    },
    entryLevel: -1,
    netProfitPercent: 3,
    netProfitUSDT: 0.72,
    netCurrentUSDT: 24.72,
    maxRunUpUSDT: 1.25,
    maxDrawdownUSDT: -0.5,
  };
}

describe("position storage migration", () => {
  it("converts flat positions and preserves averaging margin semantics", () => {
    const migrated = migrateLegacyPosition(createLegacyPosition(), {
      defaultExecutionMode: "sandbox",
    });

    validateCanonicalPosition(migrated);
    expect(isCanonicalPosition(migrated)).toBe(true);
    expect(migrated).toMatchObject({
      symbol: "KITE",
      opened: {
        t: 1_000,
        vPoint: { id: "B_KITE", lvl: -1 },
        reason: "COMMON",
        message: "[BUY] KITE common entry",
        price: 0.1,
      },
      exposure: {
        quantity: 240,
        averageEntryPrice: 0.1,
        notionalUsdt: 24,
        marginUsdt: 6,
        leverage: 4,
      },
      strategy: {
        entry: {
          feature: { market: { globalVolatilityIndex: 2 } },
        },
        averaging: {
          entryLevel: -1,
          lastHandledLevel: -2,
          reserveBaseMarginUsdt: 6,
          reservedRemainingMarginUsdt: 0,
          steps: [
            {
              level: -2,
              marginUsdt: 12,
              allocationPct: 2,
              status: "USED",
            },
          ],
          executions: [
            {
              t: 2_000,
              level: -2,
              marginUsdt: 12,
              price: 0.09,
              allocationPct: 2,
            },
          ],
        },
      },
      pnl: {
        maxUpUsdt: 1.25,
        maxDownUsdt: -0.5,
      },
    });
    expect(migrated.opened.source).toBeUndefined();
    expect("entryTime" in migrated).toBe(false);
    expect("entryFeature" in migrated).toBe(false);
  });

  it("converts closed positions with structured source and reason", () => {
    const migrated = migrateLegacyPosition(
      {
        ...createLegacyPosition(),
        exitTime: 3_000,
        exitPrice: 0.11,
        exitFeeUSDT: 0.025,
        exitId: "T_KITE",
        exitLevel: 1,
        exitMessage: "[CLOSED_ON_EXCHANGE] MANUAL STOP_LOSS",
      },
      { defaultExecutionMode: "sandbox" },
    );

    expect(migrated.closed).toEqual({
      t: 3_000,
      source: "EXCHANGE",
      price: 0.11,
      feeUsdt: 0.025,
      vPoint: { id: "T_KITE", lvl: 1 },
      reason: "STOP_LOSS",
      message: "[CLOSED_ON_EXCHANGE] MANUAL STOP_LOSS",
    });
    expect(migrated.fees.estimatedExitUsdt).toBeUndefined();
  });

  it.each([
    ["[COMMON]", "COMMON", undefined],
    ["[MANUAL]", "MANUAL", "MANUAL"],
    ["[BYPASS]", "BYPASS", "BYPASS"],
    ["[SHORT]", "COMMON", undefined],
    ["[UNRECOGNIZED]", "UNKNOWN", undefined],
  ] as const)(
    "maps legacy entry category %s to reason %s",
    (category, reason, source) => {
      const migrated = migrateLegacyPosition(
        {
          ...createLegacyPosition(),
          category,
          message: `entry ${category}`,
        },
        { defaultExecutionMode: "sandbox" },
      );

      expect(migrated.opened).toMatchObject({
        reason,
        message: `entry ${category}`,
      });
      expect(migrated.opened.source).toBe(source);
    },
  );

  it("recursively migrates mode storage and is idempotent", () => {
    const legacy = createLegacyPosition();
    delete (legacy as Partial<typeof legacy>).executionMode;
    const first = migratePositionJson({
      modes: {
        live: {
          positions: [legacy],
        },
      },
    });

    expect(first.changed).toBe(true);
    expect(first.positions).toBe(1);
    const position = (first.value as any).modes.live.positions[0];
    expect(position.executionMode).toBe("live");

    const second = migratePositionJson(first.value);
    expect(second.changed).toBe(false);
    expect(second.positions).toBe(1);
    expect(second.value).toEqual(first.value);
  });

  it("backfills compact intermediate vPoints and stays idempotent", () => {
    const position = createTestPosition({
      closed: {
        feeUsdt: 0,
        price: 11,
        reason: "TAKE_PROFIT",
        t: 400,
        vPoint: { id: "T_EXIT", lvl: 0 },
      },
      entryId: "B_ENTRY",
      symbol: "SUI",
    });
    const context = {
      defaultExecutionMode: "sandbox" as const,
      vPointSourcesBySymbol: {
        SUI: [[
          { id: "B_ENTRY", lvl: -2, t: 100 },
          { id: "B_SKIPPED", lvl: -3, t: 200 },
          { id: "T_EXIT", lvl: 0, t: 300 },
        ]],
      },
    };

    const first = migratePositionJson(position, context);

    // BOTH:POSITION_VPOINT_PATH
    expect(first.changed).toBe(true);
    expect(first.vPointPathsAdded).toBe(1);
    expect((first.value as Position).vPoints).toEqual([
      { id: "B_SKIPPED", lvl: -3 },
    ]);

    const second = migratePositionJson(first.value, context);
    expect(second.changed).toBe(false);
    expect(second.vPointPathsAdded).toBe(0);
  });

  it("rejects non-compact persisted vPoint records", () => {
    const invalid = {
      ...createTestPosition(),
      vPoints: [{ id: "B_EXTRA", lvl: -3, t: 200 }],
    };

    expect(() => validateCanonicalPosition(invalid)).toThrow(
      "position.vPoints is invalid",
    );
  });

  it("reconstructs opened.price for the preceding canonical shape", () => {
    const previousCanonical = createTestPosition({
      averaging: {
        entryLevel: -1,
        lastHandledLevel: -2,
        reserveBaseMarginUsdt: 100,
        reservedRemainingMarginUsdt: 0,
        steps: [],
        executions: [
          {
            t: 2_000,
            level: -2,
            marginUsdt: 80,
            price: 80,
            allocationPct: 5,
          },
        ],
      },
      entryLevel: -1,
      entryPrice: 90,
      leverage: 1,
      quantity: 2,
    });
    delete (previousCanonical.opened as Partial<Position["opened"]>).price;

    const result = migratePositionJson(previousCanonical);

    expect(result.changed).toBe(true);
    expect((result.value as Position).opened.price).toBeCloseTo(100);
  });

  it("removes legacy lastUpdatedAt from canonical positions", () => {
    const position = {
      ...createTestPosition(),
      lastUpdatedAt: 1_000,
      lastMonitoringStage: {
        stage: "standard",
        lastUpdated: 2_000,
        reason: "No Speedup rule matched",
      },
    } as Position & { lastUpdatedAt: number };

    const first = migratePositionJson(position);

    expect(first.changed).toBe(true);
    expect(first.positions).toBe(1);
    expect("lastUpdatedAt" in (first.value as Position)).toBe(false);
    expect((first.value as Position).lastMonitoringStage).toEqual(
      position.lastMonitoringStage,
    );

    const second = migratePositionJson(first.value);
    expect(second.changed).toBe(false);
    expect(second.value).toEqual(first.value);
  });

  it("rejects canonical records that retain legacy top-level keys", () => {
    const invalid = {
      ...createTestPosition(),
      entryTime: 1_000,
    };

    expect(() => validateCanonicalPosition(invalid)).toThrow(
      "still contains legacy key entryTime",
    );
  });

  it("validates the optional canonical funding snapshot", () => {
    // PROD:MONITORING_POSITION_FUNDING_RATE
    const position = createTestPosition();
    position.funding = {
      exchange: "binance",
      nextT: 3_000,
      rate: -0.0005,
      t: 2_000,
    };

    expect(() => validateCanonicalPosition(position)).not.toThrow();
    expect(() =>
      validateCanonicalPosition({
        ...position,
        funding: { ...position.funding, rate: Number.NaN },
      }),
    ).toThrow(".funding is invalid");
  });

  it("keeps the newest duplicate position and removes the older one", () => {
    const newer = {
      ...createLegacyPosition(),
      exitTime: 3_000,
      exitPrice: 0.11,
      exitMessage: "newer close",
    };
    const older = {
      ...createLegacyPosition(),
      exitTime: 2_000,
      exitPrice: 0.09,
      exitMessage: "older close",
    };

    const result = migratePositionJson([newer, older]);

    expect(result.changed).toBe(true);
    expect(result.positions).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.value).toMatchObject([
      {
        opened: { vPoint: { id: "B_KITE" } },
        closed: { t: 3_000, message: "newer close" },
      },
    ]);
  });

  it("never selects config or account files for position migration", () => {
    const roots = {
      slow: "/storage/slow",
      backtest: "/storage/backtest",
    };

    expect(
      isPositionMigrationFile("/storage/slow/config.json", roots),
    ).toBe(false);
    expect(
      isPositionMigrationFile("/storage/slow/accounts.json", roots),
    ).toBe(false);
    expect(
      isPositionMigrationFile("/storage/backtest/run/config.json", roots),
    ).toBe(false);
    expect(
      isPositionMigrationFile("/storage/slow/memory.json", roots),
    ).toBe(true);
    expect(
      isPositionMigrationFile("/storage/slow/live/history/BTC.json", roots),
    ).toBe(true);
    expect(
      isPositionMigrationFile(
        "/storage/backtest/run/modelMemoryMap.json",
        roots,
      ),
    ).toBe(true);
  });

  it("leaves split config payloads byte-equivalent in memory", () => {
    const config = {
      config: {
        symbols: ["WAL", "KITE"],
        takeProfitPercent: 2,
      },
      runtime: {
        runnerEnabled: false,
      },
      updatedAt: 123,
    };

    const result = migratePositionJson(config);

    expect(result.changed).toBe(false);
    expect(result.positions).toBe(0);
    expect(JSON.stringify(result.value)).toBe(JSON.stringify(config));
  });
});
