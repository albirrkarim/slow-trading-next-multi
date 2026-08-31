import type { Position } from "@/lib/trading/models";
import type { SlowTradingStorageData } from "../types";

/** Split config file payload stored under the SLOW storage root. */
export interface SlowTradingConfigFileData {
  /** Strategy configuration persisted in the config split file. */
  config: SlowTradingStorageData["config"];
  /** Runtime controls persisted in the config split file. */
  runtime: Omit<
    SlowTradingStorageData["runtime"],
    "exchangeAccounts" | "sandboxEnabled" | "sandboxInitialBalanceUSDT"
  >;
  /** Last config-file update timestamp in milliseconds. */
  updatedAt: number;
}

/** Split account file payload stored under the SLOW storage root. */
export interface SlowTradingAccountsFileData {
  /** Saved exchange accounts and private credentials. */
  accounts: SlowTradingStorageData["runtime"]["exchangeAccounts"];
  /** Slugs that cannot be reused because history may still reference them. */
  retiredSlugs: string[];
  /** Last account-file update timestamp in milliseconds. */
  updatedAt: number;
}

/** Split memory file payload stored under the SLOW storage root. */
export interface SlowTradingMemoryFileData {
  /** Mode-specific execution memory isolated by immutable account slug. */
  accounts: Record<string, SlowTradingStorageData["modes"]>;
  /** Pre-multi-account memory accepted only while normalizing test fixtures. */
  modes?: SlowTradingStorageData["modes"];
  /** Last memory-file update timestamp in milliseconds. */
  updatedAt: number;
}

/** Canonical position persisted in one symbol history file. */
export type HistoryPosition = Position;
