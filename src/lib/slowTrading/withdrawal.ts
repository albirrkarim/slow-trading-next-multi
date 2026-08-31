import { getExchange } from "@/lib/exchange";
import slowTradingStorage from "./storage";
import slowTradingWithdrawalSchedule from "./withdrawal-schedule";
import type {
  SlowTradingWithdrawalConfig,
  SlowTradingWithdrawalSchedule,
} from "./types";

const MAX_MANUAL_WITHDRAW_USDT = 2;

/** Resolves the amount submitted for a manual or automatic withdrawal. */
function getExecutionAmountUSDT(
  configuredAmountUSDT: number,
  trigger: "manual" | "automatic",
): number {
  const normalizedAmountUSDT = Math.max(0, Number(configuredAmountUSDT) || 0);

  // PROD:MANUAL_WITHDRAWAL_CAP
  // PROD:AUTOMATIC_WITHDRAWAL_AMOUNT
  return trigger === "manual"
    ? Math.min(normalizedAmountUSDT, MAX_MANUAL_WITHDRAW_USDT)
    : normalizedAmountUSDT;
}

/** Result returned after trying one withdrawal schedule. */
export interface SlowTradingWithdrawalExecutionResult {
  /** Immutable account slug whose funds were inspected. */
  account: string;
  /** SLOW mode active when the withdrawal flow ran. */
  activeMode: "live" | "sandbox";
  /** Withdrawal amount after trigger-specific safety limits. */
  amountUSDT: number;
  /** Safe Haven balance available before execution. */
  availableSafeHavenUSDT: number;
  /** Whether all checks allowed the withdrawal to execute. */
  canExecute: boolean;
  /** Whether the result came from a non-mutating dry run. */
  dryRun: boolean;
  /** Whether a real exchange withdrawal was submitted. */
  executed: boolean;
  /** Human-readable result message. */
  message: string;
  /** Schedule id used for the withdrawal flow. */
  scheduleId: string;
  /** Schedule name used for the withdrawal flow. */
  scheduleName: string;
  /** Target withdrawal network. */
  targetNetwork: string;
  /** Target withdrawal wallet address. */
  targetWalletAddress: string;
  /** Exchange withdrawal id returned after successful submission. */
  withdrawId?: string;
}

/**
 * Normalizes string into the shape expected by SLOW.
 */
function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Patches schedule status into the withdrawal schedule state.
 */
function patchScheduleStatus(
  withdrawal: SlowTradingWithdrawalConfig,
  scheduleId: string,
  patch: Partial<SlowTradingWithdrawalSchedule>,
): SlowTradingWithdrawalConfig {
  return {
    ...withdrawal,
    schedules: withdrawal.schedules.map((schedule) =>
      schedule.id === scheduleId ? { ...schedule, ...patch } : schedule,
    ),
  };
}

/**
 * Executes slow trading withdrawal schedule from validation through final SLOW state updates.
 */
export async function executeSlowTradingWithdrawalSchedule(params: {
  clientWithdrawId?: string;
  enforceInterval?: boolean;
  logAttempts?: boolean;
  scheduleId: string;
  trigger?: "manual" | "automatic";
}): Promise<SlowTradingWithdrawalExecutionResult> {
  // A. Load active SLOW state and resolve the selected schedule.
  const trigger = params.trigger ?? "manual";
  const logAttempts = params.logAttempts !== false;
  const catalogStorage = await slowTradingStorage.data.load({
    modeScope: "active",
  });
  const configuredSchedule =
    catalogStorage.runtime.withdrawal.schedules.find(
      (item) => item.id === params.scheduleId,
    ) ?? null;
  const storage = configuredSchedule
    ? await slowTradingStorage.data.load({
        account: configuredSchedule.account,
        modeScope: "active",
      })
    : catalogStorage;
  const activeMode = slowTradingStorage.mode.getActive(storage);
  const modeState = storage.modes[activeMode];
  const withdrawal = storage.runtime.withdrawal;
  const schedule = configuredSchedule;

  if (!schedule) {
    await slowTradingStorage.logs.appendWithdrawal({
      account: storage.account.slug,
      trigger,
      status: "failed",
      mode: activeMode,
      scheduleId: params.scheduleId,
      message: "Please choose which withdrawal schedule to run.",
    });
    throw new Error("Please choose which withdrawal schedule to run.");
  }

  // B. Normalize schedule input into the exact withdrawal target.
  const configuredAmountUSDT = Math.max(0, Number(schedule.amountUSDT) || 0);
  const amountUSDT = getExecutionAmountUSDT(configuredAmountUSDT, trigger);
  const wallet = schedule.walletId
    ? withdrawal.walletBook.find((item) => item.id === schedule.walletId)
    : undefined;
  const targetNetwork = normalizeString(wallet?.network ?? schedule.targetNetwork);
  const targetWalletAddress = normalizeString(
    wallet?.address ?? schedule.targetWalletAddress,
  );
  const availableSafeHavenUSDT = Math.max(
    0,
    Number(modeState.dynamicTradeMemory.safeHaven) || 0,
  );
  const baseResponse = {
    account: storage.account.slug,
    activeMode,
    amountUSDT,
    availableSafeHavenUSDT,
    dryRun: false,
    executed: false,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    targetNetwork,
    targetWalletAddress,
  };

  // C. Prepare schedule-scoped logging and failure helpers.
  /**
   * Writes withdrawal log into SLOW persistent storage.
   */
  const writeWithdrawalLog = (logInput: {
    message: string;
    status: "attempted" | "skipped" | "failed" | "executed";
    withdrawId?: string;
  }) => {
    if (!logAttempts) {
      return Promise.resolve(null);
    }

    return slowTradingStorage.logs.appendWithdrawal({
      account: storage.account.slug,
      trigger,
      status: logInput.status,
      mode: activeMode,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      amountUSDT,
      availableSafeHavenUSDT,
      targetNetwork,
      targetWalletAddress,
      message: logInput.message,
      ...(logInput.withdrawId ? { withdrawId: logInput.withdrawId } : {}),
    });
  };

  await writeWithdrawalLog({
    status: "attempted",
    message: `Trying ${trigger} withdrawal schedule "${schedule.name}" for ${amountUSDT} USDT.`,
  });

  /**
   * Records withdrawal failure and returns a safe response.
   */
  const failWithdrawal = async (message: string): Promise<never> => {
    await writeWithdrawalLog({
      status: "failed",
      message,
    });
    throw new Error(message);
  };

  // D. Validate all safety gates before touching real funds.
  if (!schedule.enabled) {
    await failWithdrawal("Selected withdrawal schedule is disabled.");
  }

  // D.1 Respect the recurring monthly date when automatic mode asks for it.
  if (
    params.enforceInterval &&
    !slowTradingWithdrawalSchedule.timing.isDue(schedule, Date.now())
  ) {
    await writeWithdrawalLog({
      status: "skipped",
      message: "Selected withdrawal schedule is not due yet.",
    });
    return {
      ...baseResponse,
      canExecute: false,
      message: "Selected withdrawal schedule is not due yet.",
    };
  }

  if (activeMode !== "live") {
    await failWithdrawal("Real withdrawal is blocked while SLOW is in sandbox mode.");
  }

  if (storage.config.exchangeType !== "binance") {
    await failWithdrawal("Real withdrawal is currently implemented only for Binance.");
  }

  if (!(configuredAmountUSDT > 0)) {
    await failWithdrawal("Withdrawal amount must be greater than 0 USDT.");
  }

  if (!targetNetwork) {
    await failWithdrawal("Target network is required before trying the withdraw flow.");
  }

  if (!targetWalletAddress) {
    await failWithdrawal("Target wallet address is required before trying the withdraw flow.");
  }

  if (availableSafeHavenUSDT < amountUSDT) {
    await failWithdrawal("Safe Haven balance is lower than the configured withdrawal amount.");
  }

  // E. Submit the real exchange withdrawal and persist the successful state.
  try {
    const response = await slowTradingStorage.account.runWithExchangeAccount(
      storage,
      async () => {
        const exchange = getExchange(storage.config.exchangeType, {
          defaultTradingMode: storage.config.tradingMode,
        });

        return exchange.withdrawAsset({
          asset: "USDT",
          address: targetWalletAddress,
          amount: amountUSDT,
          network: targetNetwork,
          clientWithdrawId:
            params.clientWithdrawId ??
            `slow-${schedule.id}-${Date.now()}`.slice(0, 64),
        });
      },
    );
    const nextSafeHavenUSDT = Math.max(
      0,
      availableSafeHavenUSDT - amountUSDT,
    );
    const timestamp = Date.now();

    await slowTradingStorage.data.update({
      // PROD:MULTI_ACCOUNT_WITHDRAWAL_OWNER
      exchangeAccountSlug: storage.account.slug,
      safeHavenUSDT: nextSafeHavenUSDT,
      safeHavenLogReason: `Withdrawal schedule "${schedule.name}" executed`,
      safeHavenLogSource: "withdrawal",
      withdrawal: patchScheduleStatus(withdrawal, schedule.id, {
        lastAttemptAt: timestamp,
        lastSuccessAt: timestamp,
        lastStatus: `EXECUTED:${response.id}`,
      }),
    });

    const message = `Submitted real Binance USDT withdrawal for ${amountUSDT} USDT from schedule "${schedule.name}". Binance withdraw id: ${response.id}`;
    await writeWithdrawalLog({
      status: "executed",
      message,
      withdrawId: response.id,
    });

    return {
      ...baseResponse,
      canExecute: true,
      executed: true,
      message,
      withdrawId: response.id,
    };
  } catch (error: any) {
    // E.1 Persist failed attempts so the UI can review what happened.
    await slowTradingStorage.data.update({
      withdrawal: patchScheduleStatus(withdrawal, schedule.id, {
        lastAttemptAt: Date.now(),
        lastStatus: `FAILED:${error?.message ?? "unknown"}`.slice(0, 240),
      }),
    });

    await writeWithdrawalLog({
      status: "failed",
      message: error?.message ?? "Withdrawal failed",
    });

    throw error;
  }
}

/**
 * Grouped withdrawal API for SLOW callers.
 */
const slowTradingWithdrawal = {
  limits: {
    getExecutionAmountUsdt: getExecutionAmountUSDT,
    maxManualWithdrawUsdt: MAX_MANUAL_WITHDRAW_USDT,
  },
  schedules: {
    execute: executeSlowTradingWithdrawalSchedule,
  },
} as const;

export default slowTradingWithdrawal;
export { slowTradingWithdrawal };
