import dotenv from "dotenv";
import type { ExchangeType } from "./types";

dotenv.config();

let defaultExchange: ExchangeType | null = null;

/**
 * Get the default exchange type from environment variable or config
 * Defaults to "tokocrypto" for backward compatibility
 */
export function getDefaultExchange(): ExchangeType {
  if (defaultExchange) {
    return defaultExchange;
  }

  const envExchange = process.env.EXCHANGE_TYPE?.toLowerCase();

  if (envExchange === "okx" || envExchange === "tokocrypto" || envExchange === "binance") {
    return envExchange as ExchangeType;
  }

  // Default to tokocrypto for backward compatibility
  return "tokocrypto";
}

/**
 * Set the default exchange at runtime
 * This overrides the environment variable
 * @param exchange - Exchange type to use as default
 */
export function setDefaultExchange(exchange: ExchangeType): void {
  if (exchange !== "okx" && exchange !== "tokocrypto" && exchange !== "binance") {
    throw new Error(
      `Invalid exchange type: ${exchange}. Must be "okx", "tokocrypto", or "binance"`
    );
  }
  defaultExchange = exchange;
}

/**
 * Reset the default exchange to use environment variable or default
 */
export function resetDefaultExchange(): void {
  defaultExchange = null;
}

