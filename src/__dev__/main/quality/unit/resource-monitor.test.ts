import resourceMonitor from "@/lib/runtime/resource-monitor";
import { describe, expect, it } from "vitest";

describe("runtime resource monitor", () => {
  it("includes process and V8 components in memory alerts", () => {
    const payload = resourceMonitor.alert.format({
      config: {
        channels: ["telegram"],
        dangerMb: 180,
        enabled: true,
        warningMb: 120,
      },
      level: "warning",
      previousLevel: "normal",
      sample: {
        arrayBuffersMb: 4,
        externalMb: 8,
        heapTotalMb: 96,
        heapUsedMb: 72,
        limitMb: 512,
        rssMb: 116,
        source: "cgroup",
        usedMb: 123,
      },
      t: Date.UTC(2026, 8, 6),
    });

    // PROD:RUNTIME_MEMORY_MONITOR
    expect(payload.subject).toBe("[RAM WARNING] 123 MB / 512 MB");
    expect(payload.body).toContain("Process RSS: 116 MB");
    expect(payload.body).toContain("V8 heap: 72 MB used / 96 MB committed");
    expect(payload.body).toContain("External: 8 MB");
    expect(payload.body).toContain("ArrayBuffers: 4 MB");
  });
});
