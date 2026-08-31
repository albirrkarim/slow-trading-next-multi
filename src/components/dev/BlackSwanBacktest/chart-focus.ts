import type { BlackSwanBacktestResult } from "@/lib/devBacktest/black-swan";

const INCIDENT_CONTEXT_MS = 30 * 60_000;

export interface BlackSwanChartWindow {
  endTime: number;
  hasIncident: boolean;
  startTime: number;
}

/** Calculates a focused chart window around the first protective incident. */
export function getBlackSwanChartWindow(
  result: BlackSwanBacktestResult,
): BlackSwanChartWindow {
  const firstPointTime = result.points.at(0)?.t ?? result.startTime;
  const lastPointTime = result.points.at(-1)?.t ?? result.endTime;
  const incidentStart = result.transitions.find(
    (transition) => transition.to !== "NORMAL",
  )?.t;

  if (incidentStart === undefined) {
    return {
      endTime: lastPointTime,
      hasIncident: false,
      startTime: firstPointTime,
    };
  }

  const recoveryTime = result.transitions.find(
    (transition) => transition.t > incidentStart && transition.to === "NORMAL",
  )?.t;

  return {
    endTime: Math.min(
      lastPointTime,
      (recoveryTime ?? lastPointTime) + INCIDENT_CONTEXT_MS,
    ),
    hasIncident: true,
    startTime: Math.max(firstPointTime, incidentStart - INCIDENT_CONTEXT_MS),
  };
}
