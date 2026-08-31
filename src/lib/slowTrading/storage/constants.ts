export { DEFAULT_EXCHANGE_ACCOUNT_SLUG } from "@/lib/exchange/account-context";
import type {
  SlowTradingSafeHavenConfig,
  SlowTradingWithdrawalConfig,
} from "../types";

export const DEFAULT_SANDBOX_INITIAL_BALANCE = 1000;
export const MAX_SLOW_TRADING_LOG_ENTRIES = 500;
export const DEFAULT_WITHDRAWAL_CONFIG: SlowTradingWithdrawalConfig = {
  autoEnabled: false,
  schedules: [],
  walletBook: [],
};
export const DEFAULT_SAFE_HAVEN_CONFIG: SlowTradingSafeHavenConfig = {
  autoEnabled: false,
  schedules: [],
};
