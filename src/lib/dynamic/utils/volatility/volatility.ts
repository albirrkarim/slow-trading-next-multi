import { VOLATILITY_FOLDER } from "@/components/api/constants";
import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type { ExchangeType } from "@/lib/exchange";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { tradeLog } from "@/lib/trading/helper/log";
import fs from "fs-extra";
import md5 from "md5";
import moment from "moment";

interface VolatilityPointRuntimeAddOn<T = any> {
  /**
   * Runtime owner symbol when a point is carried outside its symbol map.
   *
   * [EXCLUDE FROM DATASET]
   */
  symbol?: string;

  /**
   * used in backtest based on volatility
   *
   * [EXCLUDE FROM DATASET]
   */
  used?: boolean;

  /**
   * Delta in ms between v point before and the current v point
   */
  delta?: number;

  /**
   * just for debugging
   */
  message?: string;

  /**
   * old: What feature so the system is decide to buy using this point
   *
   * new: act as temp feature. for entry
   */
  feature?: T;

  /**
   * How sure the system to buy using this point
   */
  probability?: number;

  /**
   * Maximal USDT
   */
  maxUsdtEntry?: number;

  /**
   * Why the system decide to buy using this point
   */
  descisionLabel?: string;
}

/**
 * Volatility Point is point that mark the wave of the price volatility
 *
 * Current point is determined based on the volatility point before wether its TOP or DOWN about 5% or more.
 */
export interface VolatilityPoint<
  T = any,
> extends VolatilityPointRuntimeAddOn<T> {
  /**
   * Id for volatility point.
   *
   * Example: B_cbf_12_04_26_04_20
   * Format: [label]_[hash]_[date]
   */
  id: string;

  /**
   * Defined in milliseconds.
   */
  t: number;

  /**
   * T = TOP
   * B = BOTTOM
   */
  l: "T" | "B";

  /**
   * Percent change relative to last pivot.
   *
   * Unit: percent points, e.g. 6.74 means 6.74%.
   * Stored as 0-100 scale, not 0-1 ratio.
   */
  pct: number;

  /**
   * Current price.
   */
  p: number;

  /** Base volume. */
  vb: number;

  /** Quote volume. */
  vq: number;

  /**
   * Volatility level based on previous points.
   */
  lvl: number;
}

/**
 * Memory object used by the predictor. Can be persisted between runs.
 */
export interface PredictorMemory {
  // last confirmed pivot (price/time)
  lastPivotPrice: number;
  lastPivotTime: number;

  // local extremes while scanning for active sequences
  localMaxPrice: number;
  localMaxTime: number;
  localMinPrice: number;
  localMinTime: number;

  // active scanning state: null | "UP" | "DOWN"
  active: null | "UP" | "DOWN";

  // parameters (kept in memory to make predictor self-contained)
  moveThreshold: number; // percent to activate UP/DOWN
  stopLossPercent: number; // percent drawdown/rebound to mark pivot
}

/**
 * Creates initial predictor memory state for volatility point detection.
 *
 * The predictor uses this memory to track price movements and identify
 * significant volatility points (TOP and BOTTOM markers) as prices move.
 *
 * **Key Parameters:**
 * - moveThreshold: Percentage price change to activate UP/DOWN sequence (default 5%)
 * - stopLossPercent: Trailing stop percentage to confirm pivot (default 1%)
 *
 * @param {number} firstClose - Initial close price from first kline.
 * @param {number} firstTime - Initial timestamp in milliseconds.
 * @param {number} [moveThreshold=5] - Percent change to trigger UP/DOWN detection (5 = 5%).
 * @param {number} [stopLossPercent=1] - Trailing stop to mark confirmed pivot (1 = 1%).
 * @returns {PredictorMemory} Initialized memory state for predictor function.
 *
 * @example
 * const klines = await fetchKlines({ symbol: "BTC_USDT", interval: "5m" });
 * const firstKline = klines[0];
 * const memory = createPredictorMemory(
 *   parseFloat(firstKline[4]),  // close price
 *   firstKline[0],              // timestamp
 *   5,                          // 5% move threshold
 *   1                           // 1% stop loss
 * );
 */
export function createPredictorMemory(
  firstClose: number,
  firstTime: number,
  moveThreshold = 5,
  stopLossPercent = 1,
): PredictorMemory {
  return {
    lastPivotPrice: firstClose,
    lastPivotTime: firstTime,

    localMaxPrice: firstClose,
    localMaxTime: firstTime,
    localMinPrice: firstClose,
    localMinTime: firstTime,

    active: null,

    moveThreshold,
    stopLossPercent,
  };
}

function makeVolatilityId(prefix: string, time: number, symbol?: string) {
  const a = moment(time).format("DD_MM_YY_HH_mm");
  const hashInput = symbol ? `${symbol}:${a}` : a;
  return `${prefix}_${md5(hashInput).substring(0, 3)}_${a}`;
}

/**
 * Processes a single kline to detect volatility points (TOP/BOTTOM markers).
 *
 * This is the core volatility detection algorithm that:
 * 1. Tracks price movement from last pivot
 * 2. Activates UP/DOWN sequences when threshold is crossed
 * 3. Confirms pivots using trailing stop logic
 * 4. Returns new memory state and optional VolatilityPoint
 *
 * **Algorithm Flow:**
 * - Idle → price moves ≥ threshold → activate UP or DOWN
 * - Active UP → drawdown ≥ stopLoss → mark TOP, switch to DOWN
 * - Active DOWN → rebound ≥ stopLoss → mark BOTTOM, switch to UP
 *
 * **Functional Design:**
 * - Does NOT mutate input memory (returns new instance)
 * - Stateless except for memory object
 * - Can be used in streaming or batch mode
 *
 * @param {Kline} kline - Single candlestick [time, open, high, low, close, volume, ...].
 * @param {PredictorMemory} memory - Current predictor state (will not be mutated).
 * @returns {{memory: PredictorMemory, point?: VolatilityPoint}} New memory state and optional detected point.
 *
 * @example
 * let mem = createPredictorMemory(parseFloat(klines[0][4]), klines[0][0]);
 * const volatilityPoints = [];
 *
 * for (const kline of klines) {
 *   const result = predictor(kline, mem);
 *   mem = result.memory;  // update state
 *   if (result.point) {
 *     volatilityPoints.push(result.point);
 *     console.log(`${result.point.l} at ${result.point.t}: $${result.point.p}`);
 *   }
 * }
 */
export function predictor(
  kline: Kline,
  memory: PredictorMemory,
  symbol?: string,
): { memory: PredictorMemory; point?: VolatilityPoint } {
  // copy memory (immutable style) so we don't mutate caller's object unintentionally
  const mem: PredictorMemory = { ...memory };

  const time = kline[0];
  const close = parseFloat(kline[4]);

  // update local extremes
  if (close > mem.localMaxPrice) {
    mem.localMaxPrice = close;
    mem.localMaxTime = time;
  }
  if (close < mem.localMinPrice) {
    mem.localMinPrice = close;
    mem.localMinTime = time;
  }

  // percent change relative to last pivot
  const pctFromPivot =
    ((close - mem.lastPivotPrice) / mem.lastPivotPrice) * 100;

  // No active sequence: check activation
  if (mem.active === null) {
    if (pctFromPivot >= mem.moveThreshold) {
      mem.active = "UP";
      // ensure localMax includes current
      if (close > mem.localMaxPrice) {
        mem.localMaxPrice = close;
        mem.localMaxTime = time;
      }
      return { memory: mem }; // no pivot yet
    } else if (pctFromPivot <= -mem.moveThreshold) {
      mem.active = "DOWN";
      if (close < mem.localMinPrice) {
        mem.localMinPrice = close;
        mem.localMinTime = time;
      }
      return { memory: mem };
    } else {
      // still idle
      return { memory: mem };
    }
  }

  // Active UP sequence: look for drawdown >= stopLossPercent to mark TOP
  if (mem.active === "UP") {
    if (close > mem.localMaxPrice) {
      mem.localMaxPrice = close;
      mem.localMaxTime = time;
    }

    const drawdownFromPeak =
      ((mem.localMaxPrice - close) / mem.localMaxPrice) * 100;

    if (drawdownFromPeak >= mem.stopLossPercent) {
      // Mark TOP at localMax
      const percentage =
        ((mem.localMaxPrice - mem.lastPivotPrice) / mem.lastPivotPrice) * 100;

      // avoid duplicate marking same pivot as previous
      if (
        !(
          mem.localMaxPrice === mem.lastPivotPrice &&
          mem.localMaxTime === mem.lastPivotTime
        )
      ) {
        const point: VolatilityPoint = {
          id: makeVolatilityId("T", mem.localMaxTime, symbol),
          t: mem.localMaxTime,
          l: "T",
          pct: parseFloat(percentage.toFixed(2)),
          p: parseFloat(mem.localMaxPrice.toFixed(8)),
          vb: parseFloat(kline[5]),
          vq: parseFloat(kline[7]),
          lvl: 0,
        };

        // update pivot and reset extremes/active
        mem.lastPivotPrice = mem.localMaxPrice;
        mem.lastPivotTime = mem.localMaxTime;

        mem.localMaxPrice = mem.lastPivotPrice;
        mem.localMaxTime = mem.lastPivotTime;
        mem.localMinPrice = mem.lastPivotPrice;
        mem.localMinTime = mem.lastPivotTime;
        mem.active = null;

        return { memory: mem, point };
      } else {
        // even if duplicate, still reset state and return no point
        mem.localMaxPrice = mem.lastPivotPrice;
        mem.localMaxTime = mem.lastPivotTime;
        mem.localMinPrice = mem.lastPivotPrice;
        mem.localMinTime = mem.lastPivotTime;
        mem.active = null;
        return { memory: mem };
      }
    }

    return { memory: mem };
  }

  // Active DOWN sequence: look for rebound >= stopLossPercent to mark BOTTOM
  if (mem.active === "DOWN") {
    if (close < mem.localMinPrice) {
      mem.localMinPrice = close;
      mem.localMinTime = time;
    }

    const reboundFromBottom =
      ((close - mem.localMinPrice) / mem.localMinPrice) * 100;

    if (reboundFromBottom >= mem.stopLossPercent) {
      // Mark BOTTOM at localMin
      const percentage =
        ((mem.lastPivotPrice - mem.localMinPrice) / mem.lastPivotPrice) * 100;

      if (
        !(
          mem.localMinPrice === mem.lastPivotPrice &&
          mem.localMinTime === mem.lastPivotTime
        )
      ) {
        const point: VolatilityPoint = {
          id: makeVolatilityId("B", mem.localMinTime, symbol),
          t: mem.localMinTime,
          l: "B",
          pct: parseFloat(percentage.toFixed(2)),
          p: parseFloat(mem.localMinPrice.toFixed(8)),
          vb: parseFloat(kline[5]),
          vq: parseFloat(kline[7]),
          lvl: 0,
        };

        // update pivot and reset extremes/active
        mem.lastPivotPrice = mem.localMinPrice;
        mem.lastPivotTime = mem.localMinTime;

        mem.localMaxPrice = mem.lastPivotPrice;
        mem.localMaxTime = mem.lastPivotTime;
        mem.localMinPrice = mem.lastPivotPrice;
        mem.localMinTime = mem.lastPivotTime;
        mem.active = null;

        return { memory: mem, point };
      } else {
        mem.localMaxPrice = mem.lastPivotPrice;
        mem.localMaxTime = mem.lastPivotTime;
        mem.localMinPrice = mem.lastPivotPrice;
        mem.localMinTime = mem.lastPivotTime;
        mem.active = null;
        return { memory: mem };
      }
    }

    return { memory: mem };
  }

  // fallback: return memory unchanged
  return { memory: mem };
}

interface GetVolatilityPoints {
  symbol: string;
  range: string;
  interval: string;
  klinesPath: string;
  useCache?: boolean;
  exchangeType?: ExchangeType;
}

export async function getVolatilityPoints({
  symbol,
  range,
  interval,
  klinesPath,
  useCache = true,
  exchangeType = "okx",
}: GetVolatilityPoints): Promise<VolatilityPoint[]> {
  const cacheDir = `${VOLATILITY_FOLDER}/${exchangeType}/${range}_${interval}`;
  const cachePath = `${cacheDir}/${symbol}_${range}_${interval}.json`;

  if ((await fs.exists(cachePath)) && useCache) {
    tradeLog.debug("Using cached v points");
    const volatility = (await fs.readJson(cachePath)) as VolatilityPoint[];
    return volatility;
  }

  tradeLog.log("Generate v points");

  const klines = (await fs.readJson(klinesPath)) as Kline[];

  const volatilityPoints = detectVolatilityPoints({ klines, symbol });

  await fs.ensureDir(cacheDir);
  await fs.writeJson(cachePath, volatilityPoints);

  return volatilityPoints;
}

interface DetectVolatilityPointsProps {
  klines: Kline[];
  symbol?: string;
  vPointBefore?: VolatilityPoint;
  moveThreshold?: number;
  stopLossPercent?: number;
}

/**
 * Iterator: run predictor across whole klines array and collect points.
 *
 * @param klines Kline[] - source data (kline[i][4] is close, kline[i][0] is time ms)
 * @param moveThreshold optional percent to trigger move (default 5)
 * @param stopLossPercent optional trailing stop (default 1)
 * @returns VolatilityPoint[] in chronological order
 */
export function detectVolatilityPoints({
  klines,
  symbol,
  vPointBefore,
  moveThreshold = VOLATILITY_THRESHOLD,
  stopLossPercent = 1,
}: DetectVolatilityPointsProps): VolatilityPoint[] {
  if (!klines || klines.length === 0) return [];

  // initialize memory from first kline
  const firstClose = vPointBefore
    ? vPointBefore.p
    : parseFloat(klines[0][4]);
  const firstTime = vPointBefore ? vPointBefore.t : klines[0][0];

  let memory = createPredictorMemory(
    firstClose,
    firstTime,
    moveThreshold,
    stopLossPercent,
  );

  const points: VolatilityPoint[] = [];

  for (let i = 1, len = klines.length; i < len; i++) {
    const { memory: newMemory, point } = predictor(klines[i], memory, symbol);
    memory = newMemory;
    if (point) points.push(point);
  }

  let before = vPointBefore ? vPointBefore.l : "NEUTRAL";

  let level = vPointBefore ? vPointBefore.lvl : 0;

  for (const point of points) {
    if (before != point.l) {
      if (level == 0) {
        level = point.l == "T" ? 1 : -1;
      } else {
        level = 0;
      }
    } else {
      level += point.l == "T" ? 1 : -1;
    }

    before = point.l;

    point.lvl = level;
  }

  return points;
}
