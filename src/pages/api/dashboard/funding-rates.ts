import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import exchangeFundingRate from "@/lib/exchange/funding-rate";
import type { ExchangeType } from "@/lib/exchange/types";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading";
import type { NextApiRequest, NextApiResponse } from "next";

function normalizeSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

/** Returns the latest public futures funding snapshot for dashboard symbols. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const storage = await slowTrading.storage.data.load({ modeScope: "active" });
  const params = req.method === "GET" ? req.query : req.body;
  const symbols = normalizeSymbols(params.symbols);
  const requestedExchangeType = String(params.exchangeType || "").trim();
  const exchangeType = (
    requestedExchangeType ||
    storage.config.exchangeType ||
    DEFAULT_EXCHANGE
  ) as ExchangeType;

  try {
    const fundingRateBySymbol = await exchangeFundingRate.latest.map({
      exchangeType,
      tradingMode: storage.config.tradingMode,
      symbols: symbols.length > 0 ? symbols : storage.config.symbols,
    });
    res.json({ data: { fundingRateBySymbol } });
  } catch (error) {
    tradeLog.error("Failed to refresh dashboard funding rates", error);
    res.status(502).json({
      message: "Failed to refresh dashboard funding rates",
    });
  }
}
