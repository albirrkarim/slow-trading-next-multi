import { applyBacktestSidewaysExitForStrongCandidates } from "./backtest";
import { decideSidewaysExitForStrongCandidates } from "./decision";
import { applyProductionSidewaysExitForStrongCandidates } from "./production";

/**
 * Grouped sideways-exit API for shared SLOW decision helpers.
 */
const slowTradingSidewaysExit = {
  backtest: {
    apply: applyBacktestSidewaysExitForStrongCandidates,
  },
  decision: {
    decideForStrongCandidates: decideSidewaysExitForStrongCandidates,
  },
  production: {
    apply: applyProductionSidewaysExitForStrongCandidates,
  },
  decideForStrongCandidates: decideSidewaysExitForStrongCandidates,
} as const;

export default slowTradingSidewaysExit;
export {
  applyBacktestSidewaysExitForStrongCandidates,
  applyProductionSidewaysExitForStrongCandidates,
  decideSidewaysExitForStrongCandidates,
};
export type { SidewaysExitDecision, SidewaysExitPositionInput } from "./decision";
