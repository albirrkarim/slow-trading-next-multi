import { describe, expect, it } from "vitest";

import openPositionDuration from "@/components/LiveDashboard/Feature/open-position-duration";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("open position duration", () => {
  it("formats days with the remaining whole hours", () => {
    expect(openPositionDuration.format(0, DAY_MS + 5 * HOUR_MS)).toBe(
      "1 day 5 hours",
    );
    expect(openPositionDuration.format(0, 2 * DAY_MS + HOUR_MS)).toBe(
      "2 days 1 hour",
    );
  });

  it("formats shorter durations without empty leading units", () => {
    expect(openPositionDuration.format(0, 5 * HOUR_MS)).toBe("5 hours");
    expect(openPositionDuration.format(0, 35 * 60 * 1000)).toBe("35 minutes");
  });

  it("marks a position as old only after it exceeds one day", () => {
    expect(openPositionDuration.isOlderThanDays(0, 1, DAY_MS)).toBe(false);
    expect(openPositionDuration.isOlderThanDays(0, 1, DAY_MS + 1)).toBe(true);
  });
});
