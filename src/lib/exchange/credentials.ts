import dotenv from "dotenv";
import type { ExchangeType } from "./types";
import {
  getCurrentExchangeAccount,
  type BinanceCredentials,
  type ExchangeAccountSlug,
  type OKXCredentials,
  type TokocryptoCredentials,
} from "./account-context";

dotenv.config();

function getAccountEnvName(prefix: string, accountSlug: ExchangeAccountSlug) {
  return `${prefix}_${accountSlug.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
}

export function getOKXCredentials(
  accountSlug: ExchangeAccountSlug,
): OKXCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.slug === accountSlug && account.type === "okx") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
      passphrase: account.credentials.passphrase ?? "",
    };
  }

  const prefix = getAccountEnvName("OKX", accountSlug);

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
  accountSlug: ExchangeAccountSlug,
): BinanceCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.slug === accountSlug && account.type === "binance") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
    };
  }

  const prefix = getAccountEnvName("BINANCE", accountSlug);

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
  accountSlug: ExchangeAccountSlug,
): TokocryptoCredentials {
  const account = getCurrentExchangeAccount();
  if (account?.slug === accountSlug && account.type === "tokocrypto") {
    return {
      apiKey: account.credentials.apiKey,
      apiSecret: account.credentials.apiSecret,
    };
  }

  const prefix = getAccountEnvName("TOKOCRYPTO", accountSlug);

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
  accountSlug: ExchangeAccountSlug,
): OKXCredentials | BinanceCredentials | TokocryptoCredentials {
  if (exchangeType === "okx") return getOKXCredentials(accountSlug);
  if (exchangeType === "tokocrypto") return getTokocryptoCredentials(accountSlug);
  return getBinanceCredentials(accountSlug);
}
