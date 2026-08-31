import { tradeLog } from "../trading";
import slowTradingCycle from "./cycle";
import slowTradingBlackSwan from "./black-swan";
import slowTradingManagement from "./management";
import slowTradingNotifications from "./notifications";
import slowTradingQueue from "./queue";
import slowTradingStages, { type SlowTradingStage } from "./stages";
import slowTradingStorage from "./storage";

const MINUTE_MS = 60 * 1000;
export const SLOW_TRADING_RUNNER_IMPLEMENTATION_VERSION = 9;

/** Background in-process scheduler for the independent SLOW production stages. */
export class SlowTradingRunner {
  public readonly implementationVersion =
    SLOW_TRADING_RUNNER_IMPLEMENTATION_VERSION;

  private isRunning = false;
  private intervalIds = new Map<SlowTradingStage, NodeJS.Timeout>();
  private lastLoopState: "active" | "disabled" | null = null;
  private stageQueue: Promise<unknown> = Promise.resolve();

  /** Start every production stage loop if the runner is not already active. */
  public start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    tradeLog.log("runner started");
    // PROD:STAGE_RUN_STATS
    for (const stage of slowTradingStages.order) {
      void this.loop(stage);
    }
  }

  /** Stop every production stage loop and clear pending timers. */
  public stop() {
    this.isRunning = false;
    this.lastLoopState = null;

    for (const intervalId of this.intervalIds.values()) {
      clearTimeout(intervalId);
    }
    this.intervalIds.clear();

    tradeLog.log("runner stopped");
  }

  /** Trigger one backward-compatible full cycle manually. */
  public async tickNow(options?: {
    bypass?: boolean;
    ignoreRunnerEnabled?: boolean;
  }) {
    return this.enqueue(() => slowTradingCycle.run(options));
  }

  /** Runs one stage and schedules its next pass from the persisted cadence. */
  private async loop(stage: SlowTradingStage) {
    if (!this.isRunning) {
      return;
    }

    let intervalMs = slowTradingStages.interval.defaults[stage] * MINUTE_MS;
    try {
      const runTick = () =>
        this.isRunning ? this.tick(stage) : Promise.resolve(intervalMs);
      intervalMs =
        stage === "management" || stage === "risk-sentinel"
          ? await runTick()
          : await this.enqueue(runTick);
    } catch (error) {
      tradeLog.error(`runner ${stage} tick failed`, error);
      await slowTradingNotifications.operationalError.notify({
        source: `runner.tick.${stage}`,
        error,
      });
    }

    if (this.isRunning) {
      const intervalId = setTimeout(() => {
        void this.loop(stage);
      }, intervalMs);
      this.intervalIds.set(stage, intervalId);
    }
  }

  /** Serializes persisted stage mutations while retaining independent timers. */
  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.stageQueue.then(task, task);
    this.stageQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Executes one production stage using the latest runtime controls. */
  private async tick(stage: SlowTradingStage): Promise<number> {
    const storage = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const snapshot = slowTradingStorage.dashboard.buildState(storage);
    const intervalMs =
      slowTradingStages.interval.getMinutes(storage.runtime, stage) * MINUTE_MS;

    if (!storage.runtime.runnerEnabled) {
      if (this.lastLoopState !== "disabled") {
        tradeLog.log(
          `runner paused | mode=${snapshot.activeMode} exchange=${snapshot.config.exchangeType}`,
        );
      }

      this.lastLoopState = "disabled";
      return intervalMs;
    }

    this.lastLoopState = "active";

    if (stage === "risk-sentinel") {
      tradeLog.debug(
        `starting risk sentinel | mode=${snapshot.activeMode} exchange=${snapshot.config.exchangeType}`,
      );
      // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
      for (const account of storage.runtime.exchangeAccounts) {
        try {
          const result = await slowTradingBlackSwan.production.run(account.slug);
          if (result.forceExitSymbols.length > 0) {
            await this.enqueue(() =>
              slowTradingCycle.run({
                account: account.slug,
                disableAutoEntry: true,
                forceExitSymbols: result.forceExitSymbols,
                ignoreRunnerEnabled: true,
              }),
            );
          }
          tradeLog.debug(
            `finished risk sentinel | account=${account.slug} mode=${result.mode} state=${result.next.status} reason=${result.next.reason} emergencyExits=${result.forceExitSymbols.length}`,
          );
        } catch (error) {
          // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
          tradeLog.error(
            `risk sentinel failed | account=${account.slug}`,
            error,
          );
        }
      }
      return intervalMs;
    }

    if (stage === "management") {
      tradeLog.debug(
        `starting management stage | mode=${snapshot.activeMode} exchange=${snapshot.config.exchangeType}`,
      );
      const t0 = performance.now();
      const result = await slowTradingManagement.run();
      tradeLog.debug(
        `finished management stage took ${((performance.now() - t0) / 1000).toFixed(2)}s | mode=${result.mode} symbols=${result.symbols.length} removed=${result.removedSymbols.length}`,
      );
      return intervalMs;
    }

    if (stage === "capture-entry") {
      for (const account of storage.runtime.exchangeAccounts) {
        try {
          await slowTradingQueue.scheduler.synchronize(Date.now(), account.slug);
        } catch (error) {
          // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
          tradeLog.error(
            `queue synchronization failed | account=${account.slug}`,
            error,
          );
        }
      }
      await slowTradingQueue.processor.processDue();
    }

    tradeLog.debug(
      `starting ${stage} stage | mode=${snapshot.activeMode} exchange=${snapshot.config.exchangeType}`,
    );
    const t0 = performance.now();
    const result = await slowTradingCycle.run({
      bypass: false,
      stage,
    });

    tradeLog.debug(
      `finished ${stage} stage took ${((performance.now() - t0) / 1000).toFixed(2)}s | mode=${result.mode} symbols=${result.symbols.length} reports=${result.reports.length} balance=${result.availableQuoteAsset.toFixed(2)}`,
    );

    return intervalMs;
  }
}
