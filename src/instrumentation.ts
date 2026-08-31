/**
 * Bootstrap server-side process tasks when the standalone Next.js server starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  // PROD:RUNNER_BOOTSTRAP_ON_SERVER_START
  // PROD:RUNTIME_MEMORY_MONITOR
  const [slowTrading, { default: resourceMonitor }] = await Promise.all([
    import("@/lib/slowTrading"),
    import("@/lib/runtime/resource-monitor"),
  ]);
  await slowTrading.default.runner.get();
  resourceMonitor.lifecycle.start();
}
