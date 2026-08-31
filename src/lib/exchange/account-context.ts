import { AsyncLocalStorage } from "node:async_hooks";
import type { ExchangeType } from "./types";

export type ExchangeAccountSlug = string;
export type ExchangeAccountType = ExchangeType;
export const DEFAULT_EXCHANGE_ACCOUNT_SLUG: ExchangeAccountSlug = "binance-1";

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface OKXCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

export interface TokocryptoCredentials {
  apiKey: string;
  apiSecret: string;
}

export type ExchangeAccountCredentials =
  BinanceCredentials & {
    passphrase?: string;
  };

export interface ExchangeAccount {
  /** Immutable identifier generated from the account's first saved name. */
  slug: ExchangeAccountSlug;
  type: ExchangeAccountType;
  name: string;
  description: string;
  credentials: ExchangeAccountCredentials;
  createdAt: number;
  updatedAt: number;
}

interface ExchangeAccountContext {
  accountSlug: ExchangeAccountSlug;
  account?: ExchangeAccount;
}

const exchangeAccountStorage = new AsyncLocalStorage<ExchangeAccountContext>();

export function getCurrentExchangeAccountSlug(): ExchangeAccountSlug {
  return (
    exchangeAccountStorage.getStore()?.accountSlug ??
    DEFAULT_EXCHANGE_ACCOUNT_SLUG
  );
}

export function getCurrentExchangeAccount(): ExchangeAccount | undefined {
  return exchangeAccountStorage.getStore()?.account;
}

export async function runWithExchangeAccount<T>(
  accountOrSlug: ExchangeAccount | ExchangeAccountSlug,
  fn: () => Promise<T>,
): Promise<T> {
  const context =
    typeof accountOrSlug === "string"
      ? { accountSlug: accountOrSlug }
      : { accountSlug: accountOrSlug.slug, account: accountOrSlug };

  return await exchangeAccountStorage.run(context, fn);
}
