import { dynamicV1 } from "./dynamic/v1";

export { dynamicV1 as getTradingDecision } from "./dynamic/v1";

export * from "./type";

export const MODEL_MAP: Record<string, any> = {
  // from July - October 2025
  // "passive.v4": passiveV4,
  // "passive.v5": passiveV5,

  // From November 2025 we use this.
  "dynamic.v1": dynamicV1,
};


export const PEPE_MODEL_CONFIG_V1 = {
  takeProfitPercent: 5,
  stopLossPercent: 90,
  maxHoldMinutes: 60 * 24 * 30 * 12,
};
