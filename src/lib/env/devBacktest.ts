export function isDevBacktestEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEV_BACKTEST === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_BACKTEST === "1"
  );
}

