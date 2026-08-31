import type { InitialBalance } from "@/lib/trading";
import { requestPrivate } from "../utils";

interface MarginUserAsset {
  asset: string;
  borrowed: string;
  free: string;
  interest: string;
  locked: string;
  netAsset: string;
}

interface CrossMarginAccountResponse {
  userAssets: MarginUserAsset[];
}

interface IsolatedMarginAssetSide {
  asset: string;
  free: string;
  locked: string;
  totalAsset: string;
}

interface IsolatedMarginSymbolAccount {
  baseAsset: IsolatedMarginAssetSide;
  quoteAsset: IsolatedMarginAssetSide;
  symbol: string;
  enabled: boolean;
  isolatedCreated: boolean;
}

interface IsolatedMarginAccountResponse {
  assets: IsolatedMarginSymbolAccount[];
}

function parseSymbol(symbol: string): { baseAsset: string; quoteAsset: string } | null {
  const normalized = symbol.replace(/_/g, "").toUpperCase();

  const quoteAssets = ["USDT", "BUSD", "USDC", "BNB", "BTC", "ETH"];
  for (const quote of quoteAssets) {
    if (normalized.endsWith(quote) && normalized !== quote) {
      return {
        baseAsset: normalized.slice(0, -quote.length),
        quoteAsset: quote,
      };
    }
  }

  return null;
}

function toInitialBalance(params: {
  baseAvailable: number;
  quoteAvailable: number;
  baseTotal?: number;
  quoteTotal?: number;
}): InitialBalance {
  const {
    baseAvailable,
    quoteAvailable,
    baseTotal = baseAvailable,
    quoteTotal = quoteAvailable,
  } = params;

  return {
    baseAsset: baseAvailable,
    quoteAsset: quoteAvailable,
    total: baseTotal + quoteTotal,
  };
}

function toMarginAssetBalance(asset: MarginUserAsset | undefined): {
  available: number;
  total: number;
} | null {
  if (!asset) {
    return null;
  }

  const available = Number.parseFloat(asset.free ?? "0");
  const locked = Number.parseFloat(asset.locked ?? "0");
  if (!Number.isFinite(available) || !Number.isFinite(locked)) {
    return null;
  }

  return {
    available,
    total: available + locked,
  };
}

export async function getCrossMarginBalance(
  symbol: string,
): Promise<InitialBalance | null> {
  const parsed = parseSymbol(symbol);
  const assetOnly = symbol.replace(/_/g, "").toUpperCase();
  const response = await requestPrivate<CrossMarginAccountResponse>(
    "/sapi/v1/margin/account",
    {},
    "get",
  );

  const userAssets = response.userAssets ?? [];

  if (!parsed || parsed.baseAsset === parsed.quoteAsset) {
    const quoteBalance = toMarginAssetBalance(
      userAssets.find((asset) => asset.asset === assetOnly || asset.asset === "USDT"),
    );

    if (!quoteBalance) {
      return null;
    }

    return toInitialBalance({
      baseAvailable: 0,
      quoteAvailable: quoteBalance.available,
      quoteTotal: quoteBalance.total,
    });
  }

  const baseBalance = toMarginAssetBalance(
    userAssets.find((asset) => asset.asset === parsed.baseAsset),
  );
  const quoteBalance = toMarginAssetBalance(
    userAssets.find((asset) => asset.asset === parsed.quoteAsset),
  );

  if (!baseBalance || !quoteBalance) {
    return null;
  }

  return toInitialBalance({
    baseAvailable: baseBalance.available,
    quoteAvailable: quoteBalance.available,
    baseTotal: baseBalance.total,
    quoteTotal: quoteBalance.total,
  });
}

export async function getIsolatedMarginBalance(
  symbol: string,
): Promise<InitialBalance | null> {
  const parsed = parseSymbol(symbol);
  const normalized = symbol.replace(/_/g, "").toUpperCase();
  const response = await requestPrivate<IsolatedMarginAccountResponse>(
    "/sapi/v1/margin/isolated/account",
    parsed && parsed.baseAsset !== parsed.quoteAsset ? { symbols: normalized } : {},
    "get",
  );

  const assets = response.assets ?? [];

  if (!parsed || parsed.baseAsset === parsed.quoteAsset) {
    const quoteAsset = parsed?.quoteAsset ?? "USDT";
    const totalQuoteAvailable = assets.reduce((sum, account) => {
      if (account.quoteAsset.asset !== quoteAsset) {
        return sum;
      }

      const available = Number.parseFloat(account.quoteAsset.free ?? "0");
      return Number.isFinite(available) ? sum + available : sum;
    }, 0);

    const totalQuote = assets.reduce((sum, account) => {
      if (account.quoteAsset.asset !== quoteAsset) {
        return sum;
      }

      const total = Number.parseFloat(account.quoteAsset.totalAsset ?? "0");
      return Number.isFinite(total) ? sum + total : sum;
    }, 0);

    return toInitialBalance({
      baseAvailable: 0,
      quoteAvailable: totalQuoteAvailable,
      quoteTotal: totalQuote,
    });
  }

  const account = assets.find((item) => item.symbol === normalized);
  if (!account) {
    return null;
  }

  const baseAvailable = Number.parseFloat(account.baseAsset.free ?? "0");
  const quoteAvailable = Number.parseFloat(account.quoteAsset.free ?? "0");
  const baseTotal = Number.parseFloat(account.baseAsset.totalAsset ?? "0");
  const quoteTotal = Number.parseFloat(account.quoteAsset.totalAsset ?? "0");

  if (
    !Number.isFinite(baseAvailable) ||
    !Number.isFinite(quoteAvailable) ||
    !Number.isFinite(baseTotal) ||
    !Number.isFinite(quoteTotal)
  ) {
    return null;
  }

  return toInitialBalance({
    baseAvailable,
    quoteAvailable,
    baseTotal,
    quoteTotal,
  });
}
