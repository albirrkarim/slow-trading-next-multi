import {
  SLOW_TRADING_RUNNER_IMPLEMENTATION_VERSION,
  SlowTradingRunner,
} from "./runner";

const globalForSlowTrading = globalThis as unknown as {
  /** Process-wide SLOW runner singleton reused across module reloads. */
  slowTradingRunner: SlowTradingRunner | undefined;
};

let runner: SlowTradingRunner;

const isSlowTradingRunnerDisabled =
  process.env.DISABLE_SLOW_TRADING_RUNNER === "1" ||
  process.env.DISABLE_SLOW_TRADING_RUNNER === "true" ||
  process.env.NEXT_PUBLIC_DISABLE_SLOW_TRADING_RUNNER === "1" ||
  process.env.NEXT_PUBLIC_DISABLE_SLOW_TRADING_RUNNER === "true";

// A. Build the singleton instance according to the current runtime environment.
if (isSlowTradingRunnerDisabled) {
  if (globalForSlowTrading.slowTradingRunner) {
    globalForSlowTrading.slowTradingRunner.stop();
    globalForSlowTrading.slowTradingRunner = undefined;
  }

  runner = {
    start: () => undefined,
    stop: () => undefined,
    tickNow: async () => undefined,
  } as unknown as SlowTradingRunner;
} else if (process.env.NODE_ENV !== "production") {
  const existingRunnerVersion =
    globalForSlowTrading.slowTradingRunner?.implementationVersion;

  if (
    globalForSlowTrading.slowTradingRunner &&
    existingRunnerVersion !== SLOW_TRADING_RUNNER_IMPLEMENTATION_VERSION
  ) {
    globalForSlowTrading.slowTradingRunner.stop();
    globalForSlowTrading.slowTradingRunner = undefined;
  }

  if (!globalForSlowTrading.slowTradingRunner) {
    globalForSlowTrading.slowTradingRunner = new SlowTradingRunner();
  }

  runner = globalForSlowTrading.slowTradingRunner;
  runner.start();
} else {
  if (!globalForSlowTrading.slowTradingRunner) {
    globalForSlowTrading.slowTradingRunner = new SlowTradingRunner();
  }

  runner = globalForSlowTrading.slowTradingRunner;
}

/**
 * Return the current singleton slow-trading runner instance.
 *
 * @returns Shared slow-trading runner.
 */
export const getSlowTradingRunner = () => {
  if (process.env.NODE_ENV !== "production") {
    return globalForSlowTrading.slowTradingRunner || runner;
  }

  runner.start();
  return runner;
};

export { getSlowTradingRunner as slowTradingRunner };
