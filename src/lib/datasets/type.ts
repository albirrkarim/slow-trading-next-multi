import type { GetKlinesProps, Kline } from "@/lib/exchange/platform/tokocrypto";
import type { ExchangeType } from "@/lib/exchange";

/**
 * Configuration options for the `fetchKlinesFunction`.
 * Extends {@link GetKlinesProps} but overrides `startTime` and `endTime` for flexible time range specification.
 */
export interface FetchKlinesFunctionProps extends Omit<
  GetKlinesProps,
  "startTime" | "endTime"
> {
  /**
   * Optional pre-fetched array of klines to filter instead of fetching from the API.
   */
  klines?: Kline[];

  /**
   * Human-readable shorthand for time duration (e.g., '1minute', '2week', '6month').
   * Will be converted to minutes if `minutes` is not explicitly provided.
   */
  simpleTime?: string;

  /**
   * Time duration in minutes to determine how much historical data to fetch.
   * Overrides `simpleTime` if both are provided.
   */
  minutes?: number;

  /**
   * Folder path where the resulting klines JSON file should be saved (if `saveToFile` is true).
   */
  folder?: string;

  /**
   * Whether to save the fetched or filtered klines to a JSON file.
   * @default false
   */
  saveToFile?: boolean;

  /**
   * Include ?
   * From [date] to [date]
   */
  exactDate?: boolean;

  useCache?: boolean;

  /**
   * Whether to print logs and progress to the console.
   * @default true
   */
  verbose?: boolean;

  /**
   * Reports download progress after each exchange batch is processed.
   */
  onProgress?: (progress: {
    completedBatches: number;
    percent: number;
    totalBatches: number;
  }) => void;

  /** Stops a batched download before the next exchange request. */
  signal?: AbortSignal;

  /**
   * Start time for fetching klines, in milliseconds (Unix timestamp).
   * Can be used with `endTime` or `minutes` to define a range.
   */
  startTime?: number;

  /**
   * End time for fetching klines, in milliseconds (Unix timestamp).
   * Can be used with `startTime`, or defaults to `Date.now()` if only `minutes` is given.
   */
  endTime?: number;

  /**
   * Exchange type to fetch data from.
   * @default "tokocrypto"
   */
  exchangeType?: ExchangeType;

  /**
   * Force using the exchange type
   */
  exchangeTypeForce?: boolean;

  /**
   * Market type: SPOT or FUTURES
   * When defined, exchange will focus on that specific market
   */
  marketType?: "SPOT" | "FUTURES";
}

/**
 * Function that can be flexible it can be injected with dataset data. or get real data from API
 */
export type FetchKlinesFunction = (
  props: FetchKlinesFunctionProps,
) => Promise<Kline[]>;
