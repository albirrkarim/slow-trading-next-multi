import moment from "moment";
import type { VolatilityPoint } from "./volatility";

export interface ConstantaSide {
  meanMs: number;
  meanHuman?: string;
}

export interface Constanta {
  topToBottom: ConstantaSide;
  bottomToTop: ConstantaSide;
}

export interface PredictNextTopAndBottom {
  nextTimeTop: number; // timestamp in ms
  nextTimeBottom: number; // timestamp in ms
  nextTopHuman?: string; // optional human readable
  nextBottomHuman?: string;
}

/**
 * Predict next TOP and BOTTOM timestamps using means.
 *
 * @param lastPoint - last observed volatility point (TOP or BOTTOM). If label is missing, predictions are anchored independently.
 * @param constanta - object containing meanMs for topToBottom and bottomToTop
 * @returns predicted timestamps (ms) plus optional human strings
 *
 * Note: This returns simple expected times based on mean durations (statistical expectation). It's not a guarantee.
 */
export function predictNextTopAndBottom(
  lastPoint: Partial<VolatilityPoint> & { t: number },
  constanta: Constanta
): PredictNextTopAndBottom {
  const now = lastPoint.t;

  const topToBottomMs = constanta.topToBottom?.meanMs ?? 0;
  const bottomToTopMs = constanta.bottomToTop?.meanMs ?? 0;

  let nextTopMs: number;
  let nextBottomMs: number;

  if (lastPoint.l === "T") {
    // next bottom expected after TOP -> BOTTOM mean
    nextBottomMs = Math.round(now + topToBottomMs);
    // next top after that: bottom -> top mean
    nextTopMs = Math.round(nextBottomMs + bottomToTopMs);
  } else if (lastPoint.l === "B") {
    // next top expected after BOTTOM -> TOP mean
    nextTopMs = Math.round(now + bottomToTopMs);
    // next bottom after that: top -> bottom mean
    nextBottomMs = Math.round(nextTopMs + topToBottomMs);
  } else {
    // unknown label: provide both anchored independently to the provided time
    // (user said "maybe bottom or top doesn't matter")
    nextTopMs = Math.round(now + bottomToTopMs);
    nextBottomMs = Math.round(now + topToBottomMs);
  }

  return {
    nextTimeTop: nextTopMs,
    nextTimeBottom: nextBottomMs,
    nextTopHuman: moment(nextTopMs).format("DD-MM-YYYY HH:mm"),
    nextBottomHuman: moment(nextBottomMs).format("DD-MM-YYYY HH:mm"),
  };
}
