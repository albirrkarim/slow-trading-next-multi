import { describe, expect, it } from "vitest";

import {
  migrateNotificationConfig,
  migrateNotificationMemory,
} from "@/pages/api/alter/notification";

describe("notification storage alter", () => {
  it("converts legacy notification types and removes the global level", () => {
    const legacy = {
      highVolatilityMinAbsoluteLevel: 4,
      telegram: {
        enabled: true,
        types: [
          "NOTIF_HIGH_VOLATILITY",
          "NOTIF_STALE_POSITION",
          "NOTIF_LONG_OPEN_POSITION",
          "NOTIF_ERROR",
        ],
      },
      email: {
        enabled: true,
        types: ["NOTIF_ERROR"],
      },
    };

    expect(migrateNotificationConfig(legacy)).toEqual({
      telegram: {
        enabled: true,
        types: [
          {
            id: "NOTIF_HIGH_VOLATILITY",
            params: { level: 4 },
          },
          {
            id: "NOTIF_STALE_POSITION",
            params: { hour: 1 },
          },
          {
            id: "NOTIF_LONG_OPEN_POSITION",
            params: { hour: 24 },
          },
          { id: "NOTIF_ERROR" },
        ],
      },
      email: {
        enabled: true,
        types: [{ id: "NOTIF_ERROR" }],
      },
    });
  });

  it("converts high-volatility transition state per channel", () => {
    expect(
      migrateNotificationMemory({
        modes: {
          live: {
            highVolatilityNotificationState: {
              BTC: "NEGATIVE",
            },
          },
          sandbox: {
            highVolatilityNotificationState: {},
          },
        },
      }),
    ).toEqual({
      modes: {
        live: {
          highVolatilityNotificationState: {
            email: { BTC: "NEGATIVE" },
            telegram: { BTC: "NEGATIVE" },
          },
        },
        sandbox: {
          highVolatilityNotificationState: {
            email: {},
            telegram: {},
          },
        },
      },
    });
  });
});
