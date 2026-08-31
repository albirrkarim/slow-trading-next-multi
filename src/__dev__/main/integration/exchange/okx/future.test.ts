import { describe, test, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import type { IExchange } from "@/lib/exchange";
import { getExchange, TradingMode, UnifiedOrderSide, UnifiedOrderType } from "@/lib/exchange";
import { okx } from "@/lib/exchange/platform/okx";

// Load environment variables
dotenv.config();

describe("OKX Futures Exchange Integration Test", () => {
    const symbol = "ADA_USDT_SWAP";
    let exchange: IExchange;

    beforeAll(() => {
        exchange = getExchange("okx", {
            defaultTradingMode: TradingMode.FUTURES,
        });
        console.log(`Using exchange: ${exchange.exchangeType} for FUTURES`);
    });

    test("should check account mode, set leverage, and place a short order", async () => {
        // 1. Account Config Check (Auto-Upgrade Logic)
        console.log("\n--- Account Config Check ---");
        const config = await okx.account.getAccountConfiguration();
        expect(config).toBeDefined();

        if (config) {
            console.log(`Account Level: ${config.acctLv} (1=Simple, 2=Single, 3=Multi, 4=Portfolio)`);

            // If Simple mode, try to upgrade (though test might fail if quiz needed)
            if (config.acctLv === "1") {
                console.warn("⚠️ Account is in 'Simple' mode. Attempting upgrade...");
                try {
                    const upgraded = await okx.account.setAccountLevel("2");
                    if (upgraded) {
                        console.log("✅ Auto-upgrade successful.");
                    } else {
                        // We strictly fail the test if we can't trade futures
                        throw new Error("Failed to auto-upgrade account mode. Manual intervention required.");
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    throw new Error("Could not upgrade account mode: " + msg);
                }
            } else {
                console.log("✅ Account mode is compatible with Futures.");
            }
        }

        // 2. Set Leverage
        const leverage = 1; // Conservative for testing
        console.log(`\nSetting leverage to ${leverage}x...`);
        const leverageSet = await exchange.setLeverage(symbol, leverage);
        expect(leverageSet).toBe(true);

        // 3. Get Price
        const klines = await exchange.getKlines({ symbol, interval: "1m", limit: 1 });
        const currentPrice = parseFloat(klines[0][4] as string);
        console.log(`Current price: ${currentPrice}`);

        // 4. Place Short Order
        // For ADA-USDT-SWAP, 1 Contract = 100 ADA (approx). Min is 0.1 contract.
        // Adapter expects Base Asset quantity. So sending 10 should result in ~0.1 contract.
        const tradeAmountADA = 10;

        // 10 ada in usdt is 0.39 * 10 = 3.9
        console.log(`\nPlacing Market Short (Sell) for ${tradeAmountADA} ADA (~0.1 contract)...`);

        // UNCOMMENT TO ACTUALLY TRADE IN TESTS
        // Be careful running this in CI/CD on real money

        const orderResponse = await exchange.createOrder({
            tradeType: "ENTRY",
            symbol,
            side: UnifiedOrderSide.SELL,
            type: UnifiedOrderType.MARKET,
            quantity: tradeAmountADA,
        });

        console.log("Order Response:", orderResponse);
        expect(orderResponse.orderId).toBeDefined();

        // 5. Close Position (Optional cleanup)
        // Wait a bit then close?
        console.log("Closing position in 2 seconds...");
        await new Promise(r => setTimeout(r, 20000));

        const closeResponse = await exchange.createOrder({
            tradeType: "EXIT",
            symbol,
            side: UnifiedOrderSide.BUY,
            type: UnifiedOrderType.MARKET,
            quantity: orderResponse.executedQty,
        });
        console.log("Close Response:", closeResponse.orderId);
        expect(closeResponse.orderId).toBeDefined();

    }, 60000); // 60s timeout
});
