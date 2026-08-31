import { FILES } from "@/components/storage";
import { DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION } from "@/lib/dynamic";
import {
  runWithExchangeAccount,
  type ExchangeAccount,
  type ExchangeAccountSlug,
} from "@/lib/exchange/account-context";
import fs from "fs-extra";
import slowTradingAccountConfig from "../account-config";
import type { SlowTradingAccount, SlowTradingStorageData } from "../types";
import { DEFAULT_SANDBOX_INITIAL_BALANCE } from "./constants";
import type { SlowTradingAccountsFileData } from "./internal-types";
import slowTradingJsonFile from "./json-file";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Converts a user-facing account name into its stable slug representation. */
export function normalizeExchangeAccountSlug(
  value: unknown,
): ExchangeAccountSlug {
  return getString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Allocates a unique immutable slug without reusing deleted account slugs. */
export function createUniqueExchangeAccountSlug(params: {
  name: unknown;
  reservedSlugs: Iterable<string>;
}): ExchangeAccountSlug {
  // PROD:MULTI_ACCOUNT_IMMUTABLE_SLUG
  const reserved = new Set(
    Array.from(params.reservedSlugs, normalizeExchangeAccountSlug).filter(
      Boolean,
    ),
  );
  const base = normalizeExchangeAccountSlug(params.name) || "account";
  let slug = base;
  let suffix = 2;

  while (reserved.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function normalizeCredentials(
  credentials: unknown,
): ExchangeAccount["credentials"] {
  const record =
    credentials && typeof credentials === "object"
      ? (credentials as Record<string, unknown>)
      : {};

  return {
    apiKey: getString(record.apiKey),
    apiSecret: getString(record.apiSecret),
  };
}

function createAccount(params: {
  credentials?: unknown;
  createdAt?: number;
  description?: unknown;
  enabled?: unknown;
  name: unknown;
  sandbox?: unknown;
  sharedConfig?: SlowTradingStorageData["config"];
  slug: string;
  trading?: unknown;
  updatedAt?: number;
}): SlowTradingAccount {
  const now = Date.now();
  const sharedConfig =
    params.sharedConfig ?? DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION;
  const sandbox =
    params.sandbox && typeof params.sandbox === "object"
      ? (params.sandbox as Record<string, unknown>)
      : {};
  const trading =
    params.trading && typeof params.trading === "object"
      ? params.trading
      : slowTradingAccountConfig.trading.fromEffectiveConfig(sharedConfig);

  return {
    slug: normalizeExchangeAccountSlug(params.slug),
    type: "binance",
    name: getString(params.name) || "Binance Account",
    description: getString(params.description),
    credentials: normalizeCredentials(params.credentials),
    enabled: params.enabled !== false,
    trading: slowTradingAccountConfig.trading.fromEffectiveConfig(
      slowTradingAccountConfig.trading.toEffectiveConfig(sharedConfig, {
        trading: trading as SlowTradingAccount["trading"],
      }),
    ),
    sandbox: {
      enabled: sandbox.enabled === true,
      initialBalanceUSDT: Math.max(
        0,
        Number(sandbox.initialBalanceUSDT ?? DEFAULT_SANDBOX_INITIAL_BALANCE) ||
          0,
      ),
    },
    createdAt:
      typeof params.createdAt === "number" ? params.createdAt : now,
    updatedAt:
      typeof params.updatedAt === "number" ? params.updatedAt : now,
  };
}

/** Creates the initial Binance account profiles from environment credentials. */
export function createDefaultSlowTradingAccounts(
  sharedConfig: SlowTradingStorageData["config"] =
    DEFAULT_DYNAMIC_TRADE_CONFIG_PRODUCTION,
): SlowTradingAccount[] {
  const now = Date.now();
  const credentials = [
    {
      apiKey: process.env.BINANCE_1_API_KEY ?? process.env.BINANCE_API_KEY ?? "",
      apiSecret:
        process.env.BINANCE_1_API_SECRET ??
        process.env.BINANCE_1_SECRET_KEY ??
        process.env.BINANCE_SECRET_KEY ??
        process.env.BINANCE_API_SECRET ??
        "",
    },
    {
      apiKey: process.env.BINANCE_2_API_KEY ?? "",
      apiSecret:
        process.env.BINANCE_2_API_SECRET ??
        process.env.BINANCE_2_SECRET_KEY ??
        "",
    },
  ];

  return credentials
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index === 0 || item.apiKey || item.apiSecret)
    .map(({ item, index }) =>
      createAccount({
        slug: `binance-${index + 1}`,
        name: `Binance ${index + 1}`,
        credentials: item,
        sharedConfig,
        createdAt: now,
        updatedAt: now,
      }),
    );
}

/** Normalizes account profiles while preserving stable unique slugs. */
export function normalizeSlowTradingAccounts(params: {
  accounts: unknown;
  retiredSlugs?: unknown;
  sharedConfig?: SlowTradingStorageData["config"];
}): SlowTradingAccount[] {
  const items = Array.isArray(params.accounts) ? params.accounts : [];
  const reserved = new Set(
    (Array.isArray(params.retiredSlugs) ? params.retiredSlugs : [])
      .map(normalizeExchangeAccountSlug)
      .filter(Boolean),
  );
  const accounts: SlowTradingAccount[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<SlowTradingAccount> & { id?: unknown };
    const requestedSlug = normalizeExchangeAccountSlug(
      record.slug ?? record.id,
    );
    const slug =
      requestedSlug && !reserved.has(requestedSlug)
        ? requestedSlug
        : createUniqueExchangeAccountSlug({
            name: record.name,
            reservedSlugs: reserved,
          });
    reserved.add(slug);
    accounts.push(
      createAccount({
        slug,
        name: record.name,
        description: record.description,
        credentials: record.credentials,
        enabled: record.enabled,
        trading: record.trading,
        sandbox: record.sandbox,
        sharedConfig: params.sharedConfig,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  }

  return accounts.length > 0
    ? accounts
    : createDefaultSlowTradingAccounts(params.sharedConfig);
}

async function readAccountsFile(): Promise<Partial<SlowTradingAccountsFileData>> {
  if (!(await fs.pathExists(FILES.slow.accounts))) return {};
  return (await fs.readJSON(
    FILES.slow.accounts,
  )) as Partial<SlowTradingAccountsFileData>;
}

/** Loads all account profiles from their dedicated compact JSON file. */
export async function loadSlowTradingExchangeAccounts(
  sharedConfig?: SlowTradingStorageData["config"],
): Promise<SlowTradingAccount[]> {
  const raw = await readAccountsFile();
  const accounts = normalizeSlowTradingAccounts({
    accounts: raw.accounts,
    retiredSlugs: raw.retiredSlugs,
    sharedConfig,
  });

  if (!Array.isArray(raw.accounts)) {
    await saveSlowTradingExchangeAccounts(accounts, sharedConfig);
  }
  return accounts;
}

/** Saves account profiles and permanently reserves removed account slugs. */
export async function saveSlowTradingExchangeAccounts(
  accounts: unknown,
  sharedConfig?: SlowTradingStorageData["config"],
): Promise<SlowTradingAccount[]> {
  const previous = await readAccountsFile();
  const previousAccounts = Array.isArray(previous.accounts)
    ? previous.accounts
    : [];
  const requestedSlugs = new Set(
    (Array.isArray(accounts) ? accounts : [])
      .map((item) =>
        item && typeof item === "object"
          ? normalizeExchangeAccountSlug(
              (item as { slug?: unknown; id?: unknown }).slug ??
                (item as { id?: unknown }).id,
            )
          : "",
      )
      .filter(Boolean),
  );
  const retiredSlugs = new Set(
    (previous.retiredSlugs ?? []).map(normalizeExchangeAccountSlug),
  );

  for (const account of previousAccounts) {
    const slug = normalizeExchangeAccountSlug(
      (account as { slug?: unknown; id?: unknown }).slug ??
        (account as { id?: unknown }).id,
    );
    if (slug && !requestedSlugs.has(slug)) retiredSlugs.add(slug);
  }

  const normalized = normalizeSlowTradingAccounts({
    accounts,
    retiredSlugs: [...retiredSlugs],
    sharedConfig,
  });
  const payload: SlowTradingAccountsFileData = {
    accounts: normalized,
    retiredSlugs: [...retiredSlugs].sort(),
    updatedAt: Date.now(),
  };
  await slowTradingJsonFile.write.atomic(FILES.slow.accounts, payload);
  return normalized;
}

/** Gets the selected account profile from one scoped SLOW storage snapshot. */
export function getSlowTradingExchangeAccount(
  storage: SlowTradingStorageData,
): SlowTradingAccount {
  return storage.account;
}

/** Runs exchange calls with the credentials belonging to the scoped account. */
export async function runWithSlowTradingExchangeAccount<T>(
  storage: SlowTradingStorageData,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithExchangeAccount(storage.account, fn);
}
