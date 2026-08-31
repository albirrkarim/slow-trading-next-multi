/**
 * Centralized defaults for makeDataset / makeVector / helpers.
 * Exported so callers can reference the same canonical defaults.
 */
export const DEFAULT_MAKE_DATASET_OPTS = {
  N_RECENT: 5,
  /**
   * Max previous volatility point
   */
  N_HISTORY: 400, // about one year
  /** maximum absolute level used for level normalization and levelMap width */

  /** one month in milliseconds (used for snapshot lookup window) */
  ONE_MONTH_MS: 30 * 24 * 60 * 60 * 1000,
};

export type MakeDatasetOpts = {
  N_RECENT?: number;
  N_HISTORY?: number;

  ONE_MONTH_MS?: number;
};
