import { decisionEngineV12 } from "./v12/decision";
import { decisionEngineV14 } from "./v14/decision";
import { decisionEngineV15 } from "./v15/decision";
import { decisionEngineV16 } from "./v16/decision";
import { decisionEngineV17 } from "./v17/decision";
import { decisionEngineV18 } from "./v18/decision";
import { decisionEngineV19 } from "./v19/decision";
import { decisionEngineV20 } from "./v20/decision";

export { decisionEngineV12 as decisionEngine } from "./v12/decision";

export const DECISION_ENGINE_MAP: Record<string, typeof decisionEngineV12> = {
  // Ankara
  "decision.v12": decisionEngineV12,

  // Moscow
  "decision.v14": decisionEngineV14,

  // St Petersburg
  "decision.v15": decisionEngineV15,

  // Rome
  "decision.v16": decisionEngineV16,

  // Custom Hardcoded
  "decision.v17": decisionEngineV17,

  // Can entry level 2
  "decision.v18": decisionEngineV18,

  // Best timing with Speed tiers
  "decision.v19": decisionEngineV19,

  // Direct entry at the configured minimum absolute level
  "decision.v20": decisionEngineV20,
} as const;

export type DecisionEngineVersionType = keyof typeof DECISION_ENGINE_MAP;
