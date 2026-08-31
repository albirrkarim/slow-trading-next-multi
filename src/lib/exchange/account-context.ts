import { AsyncLocalStorage } from "node:async_hooks";
import type { ExchangeType } from "./types";

export type ExchangeAccountId = string;
export type ExchangeAccountType = ExchangeType;

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
  id: ExchangeAccountId;
  type: ExchangeAccountType;
  name: string;
  description: string;
  credentials: ExchangeAccountCredentials;
  createdAt: number;
  updatedAt: number;
}

interface ExchangeAccountContext {
  accountId: ExchangeAccountId;
  account?: ExchangeAccount;
}

const exchangeAccountStorage = new AsyncLocalStorage<ExchangeAccountContext>();

export function getCurrentExchangeAccountId(): ExchangeAccountId {
  return exchangeAccountStorage.getStore()?.accountId ?? "1";
}

export function getCurrentExchangeAccount(): ExchangeAccount | undefined {
  return exchangeAccountStorage.getStore()?.account;
}

export async function runWithExchangeAccount<T>(
  accountOrId: ExchangeAccount | ExchangeAccountId,
  fn: () => Promise<T>,
): Promise<T> {
  const context =
    typeof accountOrId === "string"
      ? { accountId: accountOrId }
      : { accountId: accountOrId.id, account: accountOrId };

  return await exchangeAccountStorage.run(context, fn);
}
