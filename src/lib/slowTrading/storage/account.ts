import {
  runWithExchangeAccount,
  type ExchangeAccount,
  type ExchangeAccountId,
  type ExchangeAccountType,
} from "@/lib/exchange/account-context";
import { FILES } from "@/components/storage";
import fs from "fs-extra";
import { DEFAULT_EXCHANGE_ACCOUNT_ID } from "./constants";
import type { SlowTradingAccountsFileData } from "./internal-types";
import slowTradingJsonFile from "./json-file";
import type { SlowTradingStorageData } from "../types";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasAnyCredential(...values: string[]): boolean {
  return values.some(Boolean);
}

function normalizeExchangeAccountType(value: unknown): ExchangeAccountType {
  if (value === "okx" || value === "tokocrypto" || value === "binance") {
    return value;
  }

  return "binance";
}

function normalizeExchangeAccountCredentials(
  type: ExchangeAccountType,
  credentials: Record<string, unknown>,
): ExchangeAccount["credentials"] {
  if (type === "okx") {
    return {
      apiKey: getString(credentials.apiKey),
      apiSecret: getString(credentials.apiSecret),
      passphrase: getString(credentials.passphrase),
    };
  }

  return {
    apiKey: getString(credentials.apiKey),
    apiSecret: getString(credentials.apiSecret),
  };
}

function createExchangeAccount(params: {
  id: string;
  type: ExchangeAccountType;
  name: string;
  description?: string;
  credentials: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}): ExchangeAccount {
  return {
    ...params,
    description: params.description ?? "",
    credentials: normalizeExchangeAccountCredentials(
      params.type,
      params.credentials,
    ),
  } as ExchangeAccount;
}

/**
 * Normalizes exchange account id into the shape expected by SLOW.
 */
export function normalizeExchangeAccountId(value: unknown): ExchangeAccountId {
  const id =
    typeof value === "number" || typeof value === "string"
      ? String(value).trim()
      : "";
  return id || DEFAULT_EXCHANGE_ACCOUNT_ID;
}

/**
 * Gets slow trading exchange account id from SLOW state or storage.
 */
export function getSlowTradingExchangeAccountId(
  storage: SlowTradingStorageData,
): ExchangeAccountId {
  return normalizeExchangeAccountId(storage.runtime.exchangeAccountId);
}

/**
 * Creates default exchange accounts from existing environment credentials.
 */
export function createDefaultExchangeAccounts(): ExchangeAccount[] {
  const now = Date.now();
  const account1 = createExchangeAccount({
    id: DEFAULT_EXCHANGE_ACCOUNT_ID,
    type: "binance",
    name: "Binance 1",
    credentials: {
      apiKey:
        process.env.BINANCE_1_API_KEY ?? process.env.BINANCE_API_KEY ?? "",
      apiSecret:
        process.env.BINANCE_1_API_SECRET ??
        process.env.BINANCE_1_SECRET_KEY ??
        process.env.BINANCE_SECRET_KEY ??
        process.env.BINANCE_API_SECRET ??
        "",
    },
    createdAt: now,
    updatedAt: now,
  });

  const account2ApiKey = process.env.BINANCE_2_API_KEY ?? "";
  const account2ApiSecret =
    process.env.BINANCE_2_API_SECRET ??
    process.env.BINANCE_2_SECRET_KEY ??
    "";
  const okxApiKey = process.env.OKX_1_API_KEY ?? process.env.OKX_API_KEY ?? "";
  const okxApiSecret =
    process.env.OKX_1_API_SECRET ?? process.env.OKX_API_SECRET ?? "";
  const okxPassphrase =
    process.env.OKX_1_API_PASSPHRASE ?? process.env.OKX_API_PASSPHRASE ?? "";
  const tokocryptoApiKey =
    process.env.TOKOCRYPTO_1_API_KEY ?? process.env.TOKOCRYPTO_API_KEY ?? "";
  const tokocryptoApiSecret =
    process.env.TOKOCRYPTO_1_API_SECRET ??
    process.env.TOKOCRYPTO_API_SECRET ??
    "";

  const accounts: ExchangeAccount[] = [account1];

  if (hasAnyCredential(account2ApiKey, account2ApiSecret)) {
    accounts.push(
      createExchangeAccount({
        id: "2",
        type: "binance",
        name: "Binance 2",
        credentials: {
          apiKey: account2ApiKey,
          apiSecret: account2ApiSecret,
        },
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  if (hasAnyCredential(okxApiKey, okxApiSecret, okxPassphrase)) {
    accounts.push(
      createExchangeAccount({
        id: "okx-1",
        type: "okx",
        name: "OKX 1",
        credentials: {
          apiKey: okxApiKey,
          apiSecret: okxApiSecret,
          passphrase: okxPassphrase,
        },
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  if (hasAnyCredential(tokocryptoApiKey, tokocryptoApiSecret)) {
    accounts.push(
      createExchangeAccount({
        id: "tokocrypto-1",
        type: "tokocrypto",
        name: "Tokocrypto 1",
        credentials: {
          apiKey: tokocryptoApiKey,
          apiSecret: tokocryptoApiSecret,
        },
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return accounts;
}

/**
 * Normalizes stored exchange accounts and keeps ids stable for selection.
 */
export function normalizeExchangeAccounts(value: unknown): ExchangeAccount[] {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const now = Date.now();

  const accounts = items
    .map((item, index): ExchangeAccount | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Partial<ExchangeAccount>;
      const id = normalizeExchangeAccountId(record.id ?? index + 1);
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);

      const credentials =
        record.credentials && typeof record.credentials === "object"
          ? (record.credentials as unknown as Record<string, unknown>)
          : {};

      const type = normalizeExchangeAccountType(record.type);

      return createExchangeAccount({
        id,
        type,
        name: getString(record.name) || `${type.toUpperCase()} ${index + 1}`,
        description: getString(record.description),
        credentials,
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : now,
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : now,
      });
    })
    .filter((account): account is ExchangeAccount => Boolean(account));

  return accounts.length > 0 ? accounts : createDefaultExchangeAccounts();
}

/**
 * Loads saved exchange accounts from the split accounts file.
 */
export async function loadSlowTradingExchangeAccounts(
  fallback?: unknown,
): Promise<ExchangeAccount[]> {
  if (await fs.pathExists(FILES.slow.accounts)) {
    const raw = (await fs.readJSON(
      FILES.slow.accounts,
    )) as Partial<SlowTradingAccountsFileData>;
    return normalizeExchangeAccounts(raw.accounts);
  }

  const accounts = normalizeExchangeAccounts(fallback);
  await saveSlowTradingExchangeAccounts(accounts);
  return accounts;
}

/**
 * Saves exchange account credentials into the split accounts file.
 */
export async function saveSlowTradingExchangeAccounts(
  accounts: unknown,
): Promise<ExchangeAccount[]> {
  const normalized = normalizeExchangeAccounts(accounts);
  const payload: SlowTradingAccountsFileData = {
    accounts: normalized,
    updatedAt: Date.now(),
  };

  await slowTradingJsonFile.write.atomic(FILES.slow.accounts, payload);

  return normalized;
}

/**
 * Gets the selected persisted exchange account when one exists.
 */
export function getSlowTradingExchangeAccount(
  storage: SlowTradingStorageData,
): ExchangeAccount | undefined {
  const accountId = getSlowTradingExchangeAccountId(storage);
  return storage.runtime.exchangeAccounts.find((item) => item.id === accountId);
}

/**
 * Runs with slow trading exchange account using the selected SLOW mode state.
 */
export async function runWithSlowTradingExchangeAccount<T>(
  storage: SlowTradingStorageData,
  fn: () => Promise<T>,
): Promise<T> {
  const account =
    getSlowTradingExchangeAccount(storage) ??
    getSlowTradingExchangeAccountId(storage);
  return runWithExchangeAccount(account, fn);
}
