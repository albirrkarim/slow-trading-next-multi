import type { UnifiedKline } from "@/lib/exchange/types";
import blackSwan from "@/lib/trading/black-swan";
import { describe, expect, it } from "vitest";

const MINUTE_MS = 60_000;

function candles(
  params: {
    endClose?: number;
    endIndex?: number;
    startTime?: number;
  } = {},
): UnifiedKline[] {
  const startTime = params.startTime ?? 1_700_000_000_000;
  const endIndex = params.endIndex ?? 65;
  const endClose = params.endClose ?? 100;
  return Array.from({ length: 66 }, (_, index) => {
    const openTime = startTime + (endIndex - 65 + index) * MINUTE_MS;
    const close = index === 65 ? endClose : 100;
    return [
      openTime,
      "100",
      "101",
      String(Math.min(close, 99)),
      String(close),
      "1",
      openTime + MINUTE_MS - 1,
      "1",
      1,
      "1",
      "1",
      "0",
      "",
    ];
  });
}

function evaluationTime(input: UnifiedKline[]) {
  return Number(input.at(-1)?.[6]);
}

function enabledConfig() {
  return {
    ...blackSwan.config.defaults,
    enabled: true,
    breadthConfirmation: {
      ...blackSwan.config.defaults.breadthConfirmation,
      minimumValidSymbols: 2,
    },
  };
}

describe("Black Swan detector", () => {
  it("keeps healthy closed candles NORMAL", () => {
    const btcCandles = candles();
    const state = blackSwan.detector.evaluate({
      config: enabledConfig(),
      currentTimeMs: evaluationTime(btcCandles),
      btcCandles,
      mode: "sandbox",
    });

    expect(state.status).toBe("NORMAL");
    expect(state.reason).toBe("HEALTHY");
  });

  it("enters WATCH for a BTC warning without systemic breadth", () => {
    const btcCandles = candles({ endClose: 95 });
    const state = blackSwan.detector.evaluate({
      config: enabledConfig(),
      currentTimeMs: evaluationTime(btcCandles),
      btcCandles,
      breadthCandlesBySymbol: {
        ETH: candles({ endClose: 99 }),
        SOL: candles({ endClose: 99 }),
      },
      mode: "sandbox",
    });

    expect(state.status).toBe("WATCH");
    expect(state.reason).toBe("BTC_WARNING");
    expect(state.evidence?.breadth?.pct).toBe(0);
    expect(blackSwan.state.isProtective(state)).toBe(true);
  });

  it("enters CRISIS when BTC warning is confirmed by altcoin breadth", () => {
    const btcCandles = candles({ endClose: 95 });
    const state = blackSwan.detector.evaluate({
      config: enabledConfig(),
      currentTimeMs: evaluationTime(btcCandles),
      btcCandles,
      breadthCandlesBySymbol: {
        ETH: candles({ endClose: 90 }),
        SOL: candles({ endClose: 89 }),
      },
      mode: "sandbox",
    });

    expect(state.status).toBe("CRISIS");
    expect(state.reason).toBe("SYSTEMIC_BREADTH");
    expect(state.evidence?.breadth).toMatchObject({
      affected: 2,
      valid: 2,
      pct: 100,
    });
  });

  it("enters CRISIS immediately for a hard BTC trigger", () => {
    const btcCandles = candles({ endClose: 91 });
    const state = blackSwan.detector.evaluate({
      config: enabledConfig(),
      currentTimeMs: evaluationTime(btcCandles),
      btcCandles,
      mode: "sandbox",
    });

    expect(state.status).toBe("CRISIS");
    expect(state.reason).toBe("BTC_HARD_TRIGGER");
  });

  it("fails closed to WATCH on stale data without inventing a CRISIS", () => {
    const btcCandles = candles({ endClose: 90 });
    const state = blackSwan.detector.evaluate({
      config: enabledConfig(),
      currentTimeMs: evaluationTime(btcCandles) + 3 * MINUTE_MS,
      btcCandles,
      mode: "sandbox",
    });

    expect(state.status).toBe("WATCH");
    expect(state.reason).toBe("DATA_STALE");
  });

  it("ignores an unclosed future candle", () => {
    const btcCandles = candles();
    const future = candles({ endClose: 80, endIndex: 66 }).at(-1)!;
    const currentTimeMs = evaluationTime(btcCandles);
    const drawdown = blackSwan.detector.calculateDrawdown({
      candles: [...btcCandles, future],
      currentTimeMs,
      windowMinutes: 5,
    });

    expect(drawdown?.current).toBe(100);
    expect(drawdown?.pct).toBe(0);
  });

  it("requires cooldown and live acknowledgement before returning NORMAL", () => {
    const config = {
      ...enabledConfig(),
      recoveryCooldownMinutes: 1,
      requireManualLiveRecovery: true,
    };
    const crashCandles = candles({ endClose: 91 });
    const crashTime = evaluationTime(crashCandles);
    const crisis = blackSwan.detector.evaluate({
      config,
      currentTimeMs: crashTime,
      btcCandles: crashCandles,
      mode: "live",
    });
    const healthyCandles = candles({ endIndex: 70 });
    const recoveryTime = evaluationTime(healthyCandles);
    const recovery = blackSwan.detector.evaluate({
      config,
      previous: crisis,
      currentTimeMs: recoveryTime,
      btcCandles: healthyCandles,
      mode: "live",
    });
    const laterCandles = candles({ endIndex: 72 });
    const manualRequired = blackSwan.detector.evaluate({
      config,
      previous: recovery,
      currentTimeMs: evaluationTime(laterCandles),
      btcCandles: laterCandles,
      mode: "live",
    });

    expect(recovery.status).toBe("RECOVERY");
    expect(manualRequired.reason).toBe("MANUAL_ACK_REQUIRED");

    const acknowledged = blackSwan.state.acknowledge(
      manualRequired,
      evaluationTime(laterCandles),
    );
    const finalCandles = candles({ endIndex: 73 });
    const normal = blackSwan.detector.evaluate({
      config,
      previous: acknowledged,
      currentTimeMs: evaluationTime(finalCandles),
      btcCandles: finalCandles,
      mode: "live",
    });
    expect(normal.status).toBe("NORMAL");
  });

  it("normalizes invalid zero thresholds to safe positive defaults", () => {
    const config = blackSwan.config.normalize({
      enabled: true,
      btcWarning: {
        fiveMinuteDrawdownPct: 0,
        fifteenMinuteDrawdownPct: -1,
      },
    });

    expect(config.btcWarning).toEqual(blackSwan.config.defaults.btcWarning);
  });

  it("closes only adverse downward exposure for CLOSE_ADVERSE", () => {
    // PROD:BLACK_SWAN_EMERGENCY_EXIT
    expect(
      blackSwan.emergency.shouldClose({
        direction: "LONG",
        exitPolicy: "CLOSE_ADVERSE",
        tradingMode: "futures",
      }),
    ).toBe(true);
    expect(
      blackSwan.emergency.shouldClose({
        direction: "SHORT",
        exitPolicy: "CLOSE_ADVERSE",
        tradingMode: "futures",
      }),
    ).toBe(false);
    expect(
      blackSwan.emergency.shouldClose({
        direction: "SHORT",
        exitPolicy: "FLATTEN_ALL",
        tradingMode: "futures",
      }),
    ).toBe(true);
    expect(
      blackSwan.emergency.shouldClose({
        direction: "LONG",
        exitPolicy: "FREEZE_ONLY",
        tradingMode: "spot",
      }),
    ).toBe(false);
  });
});
