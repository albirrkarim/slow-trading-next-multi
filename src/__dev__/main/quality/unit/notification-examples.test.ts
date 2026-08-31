import {
  SLOW_NOTIFICATION_KEYS,
  type SlowNotificationKey,
} from "@/lib/notification/config";
import notificationExamples from "@/lib/notification/examples";
import { describe, expect, it } from "vitest";

describe("notification examples", () => {
  it.each(SLOW_NOTIFICATION_KEYS)("provides content for %s", (type) => {
    const example = notificationExamples.get(type as SlowNotificationKey);

    expect(example.title.trim()).not.toBe("");
    expect(example.message.trim()).not.toBe("");
  });

  it("uses the channel's configured parameters", () => {
    expect(
      notificationExamples.get("NOTIF_HIGH_VOLATILITY", { level: 7 }).message,
    ).toContain("Threshold: abs(level) >= 7");
    expect(
      notificationExamples.get("NOTIF_STALE_POSITION", { hour: 3 }).message,
    ).toContain("Threshold: more than 3 hours");
    expect(
      notificationExamples.get("NOTIF_LONG_OPEN_POSITION", { hour: 1 }).message,
    ).toContain("Threshold: more than 1 hour\n");
  });
});
