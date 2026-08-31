import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import slowTrading from "@/lib/slowTrading";
import { describe, expect, it } from "vitest";

describe("slow dashboard global config", () => {
  it("exposes the runtime volatility threshold to dashboard clients", () => {
    const storage = slowTrading.storage.data.createDefault();
    const dashboard = slowTrading.storage.dashboard.buildState(storage);

    // PROD:GLOBAL_VOLATILITY_THRESHOLD
    expect(dashboard.globalConfig.volatilityThresholdPct).toBe(
      VOLATILITY_THRESHOLD,
    );
  });
});
