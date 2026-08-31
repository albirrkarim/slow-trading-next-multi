import { describe, test, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import type { IExchange } from "@/lib/exchange";
import {
  getExchange,
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
} from "@/lib/exchange";
import { delay } from "@/components/api/utils";

// Load environment variables
dotenv.config();

describe("OKX Exchange Integration Test", () => {
  const symbol = "SOL_USDT";
  const tradeAmountUsdt = 3;
  let exchange: IExchange;

  beforeAll(() => {
    exchange = getExchange("okx", {
      defaultTradingMode: TradingMode.SPOT,
    });
    console.log(`Using exchange: ${exchange.exchangeType}`);
  });

  test("should execute spot buy and sell flow", async () => {
    // 1. Check Funds & Transfer if needed
    if (exchange.exchangeType === "okx") {
      try {
        await (exchange as any).checkAndTransferFunds(symbol);
      } catch (e) {
        console.warn("Auto-transfer failed or not implemented, skipping...", e);
      }
    }

    // ==========================================
    // STEP 1: Buy (Market Order by Quote Quantity)
    // ==========================================
    console.log(`\n[STEP 1] Buying $${tradeAmountUsdt} worth of ${symbol}...`);

    const buyResponse = await exchange.createOrder({
      tradeType: "ENTRY",
      symbol,
      side: UnifiedOrderSide.BUY,
      type: UnifiedOrderType.MARKET,
      quoteOrderQty: tradeAmountUsdt, // Use quote quantity
    });

    console.log("Buy Response:", JSON.stringify(buyResponse, null, 2));
    expect(buyResponse.status).toBe("0"); // OKX success code

    // Wait for fill
    await delay(10000);

    // ==========================================
    // STEP 2: Verify Balance / Quantity
    // ==========================================
    const targetBaseAsset = symbol.split("_")[0]; // e.g. XRP
    const balance = await exchange.getBalance(symbol);
    console.log("Current Balance:", balance);

    let sellQuantity = 0;
    if (balance && balance.baseAsset > 0) {
      sellQuantity = balance.baseAsset;
      // Ensure we don't sell more than we just bought (optional, but good for test hygiene)
      // But for 'sell all', using balance is fine.
    } else {
      // Fallback to response executedQty if balance update is slow (unlikely for 2s wait)
      sellQuantity = buyResponse.executedQty || 0;
    }

    console.log(`Ready to sell: ${sellQuantity} ${targetBaseAsset}`);
    expect(sellQuantity).toBeGreaterThan(0);

    // ==========================================
    // STEP 3: Sell (Market Order by Base Quantity)
    // ==========================================
    console.log(`\n[STEP 3] Selling ${sellQuantity} ${targetBaseAsset}...`);

    // We rely on the adapter to handle step size adjustments for the Sell
    const sellResponse = await exchange.createOrder({
      tradeType: "EXIT",
      symbol,
      side: UnifiedOrderSide.SELL,
      type: UnifiedOrderType.MARKET,
      quantity: sellQuantity,
    });

    console.log("Sell Response:", JSON.stringify(sellResponse, null, 2));
    expect(sellResponse.status).toBe("0");
  }, 60000);
});
