/**
 * Deep-clone a JSON-safe value used by the slow-trading storage layer.
 *
 * @param value - Value to clone.
 * @returns Detached clone of the input value.
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalizes symbol into the shape expected by SLOW.
 */
export function normalizeSymbol(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

/**
 * Normalize the configured symbol list into unique uppercase values.
 *
 * @param symbols - Raw symbol list.
 * @returns Sorted unique symbols.
 */
export function uniqueSymbols(symbols: string[]): string[] {
  return Array.from(
    new Set(symbols.map(normalizeSymbol).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}
