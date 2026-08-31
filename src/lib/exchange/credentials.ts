import dotenv from "dotenv";
import type { ExchangeType } from "./types";
import {
  getCurrentExchangeAccount,
  type BinanceCredentials,
  type ExchangeAccountId,
  type OKXCredentials,
  type TokocryptoCredentials,
} from "./account-context";

dotenv.config();

function getAccountEnvName(prefix: string, accountId: ExchangeAccountId) {
  return `${prefix}_${accountId}`;
}

export function getOKXCredentials(
  accountId: ExchangeAccountId,
): OKXCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.id === accountId && account.type === "okx") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
      passphrase: account.credentials.passphrase ?? "",
    };
  }

  const prefix = getAccountEnvName("OKX", accountId);

  const apiKey =
    process.env[`${prefix}_API_KEY`] ?? process.env.OKX_API_KEY ?? "";
  const apiSecret =
    process.env[`${prefix}_API_SECRET`] ?? process.env.OKX_API_SECRET ?? "";
  const passphrase =
    process.env[`${prefix}_API_PASSPHRASE`] ??
    process.env.OKX_API_PASSPHRASE ??
    "";

  return { apiKey, apiSecret, passphrase };
}

export function getBinanceCredentials(
  accountId: ExchangeAccountId,
): BinanceCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.id === accountId && account.type === "binance") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
    };
  }

  const prefix = getAccountEnvName("BINANCE", accountId);

  const apiKey =
    process.env[`${prefix}_API_KEY`] ?? process.env.BINANCE_API_KEY ?? "";

  const apiSecret =
    process.env[`${prefix}_API_SECRET`] ??
    process.env.BINANCE_SECRET_KEY ??
    process.env.BINANCE_API_SECRET ??
    "";

  return { apiKey, apiSecret };
}

export function getTokocryptoCredentials(
  accountId: ExchangeAccountId,
): TokocryptoCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.id === accountId && account.type === "tokocrypto") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
    };
  }

  const prefix = getAccountEnvName("TOKOCRYPTO", accountId);

  const apiKey =
    process.env[`${prefix}_API_KEY`] ?? process.env.TOKOCRYPTO_API_KEY ?? "";

  const apiSecret =
    process.env[`${prefix}_API_SECRET`] ??
    process.env.TOKOCRYPTO_API_SECRET ??
    "";

  return { apiKey, apiSecret };
}

export function getExchangeCredentials(
  exchangeType: ExchangeType,
  accountId: ExchangeAccountId,
): OKXCredentials | BinanceCredentials | TokocryptoCredentials {
  if (exchangeType === "okx") return getOKXCredentials(accountId);
  if (exchangeType === "tokocrypto") return getTokocryptoCredentials(accountId);
  return getBinanceCredentials(accountId);
}
