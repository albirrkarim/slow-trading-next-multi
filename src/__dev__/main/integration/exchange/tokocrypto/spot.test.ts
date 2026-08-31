import { describe, test, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import { getExchange, UnifiedOrderSide, UnifiedOrderType, TradingMode, type IExchange } from "@/lib/exchange";
import { delay } from "@/components/api/utils";

// Load environment variables
dotenv.config();

describe("Tokocrypto Exchange Integration Test", () => {
    // Tokocrypto native symbol format is typically BASE_QUOTE (e.g. BTC_USDT)
    const symbol = "XRP_USDT";
    // Small amount for testing (Min is 5 USDT)
    const tradeAmountUsdt = 6;
    let exchange: IExchange;

    beforeAll(() => {
        exchange = getExchange("tokocrypto", {
            defaultTradingMode: TradingMode.SPOT,
        });
        console.log(`Using exchange: ${exchange.exchangeType}`);
    });

    test("should retrieve maker fee percentage", () => {
        const feeCalculator = exchange.getFees();
        const makerFee = feeCalculator.getTotalFeePercent({
            side: "buy",
            type: "maker"
        });
        console.log(`Maker Fee: ${makerFee}`);
        expect(makerFee).toBeGreaterThanOrEqual(0);
    });

    test("should place and cancel a market buy order (Maker strategy)", async () => {
        // Tokocrypto currently only supports SPOT.

        // 1. Get fresh klines for price
        const endTime = Date.now();
        const startTime = endTime - 60000; // 1 minute ago
        const klines = await exchange.getKlines({ symbol, interval: "1m", limit: 1, startTime, endTime });
        if (klines.length === 0) throw new Error("No klines for price");

        // Use close price
        const price = parseFloat(klines[klines.length - 1][4] as string);
        if (!price) throw new Error("Invalid price");

        console.log(`Current ${symbol} Price: ${price}`);

        // 2. Calculate quantity
        const rawQuantity = tradeAmountUsdt / price;


        console.log(`Raw Quantity: ${rawQuantity}`);
        const quantity = await exchange.adjustQuantity(rawQuantity, symbol);
        console.log(`Quantity: ${quantity}`);

        const limits = await exchange.getMinQtyAndStepSize(symbol);

        expect(quantity).toBeGreaterThanOrEqual(limits.minQty);

        // 3. Place Order (Market Buy)
        // Ensure we have balance first ideally, but this test assumes some balance or will fail with "insufficient balance"
        console.log("Placing Market Buy Order...");

        const orderResponse = await exchange.createOrder({
            tradeType: "ENTRY",
            symbol,
            side: UnifiedOrderSide.BUY,
            type: UnifiedOrderType.MARKET,
            quantity,
        });
        console.log("Order Response:", JSON.stringify(orderResponse, null, 2));

        // Tokocrypto success status might create orderId
        expect(orderResponse.orderId).toBeDefined();

        await delay(10000)

        const sellOrderResponse = await exchange.createOrder({
            tradeType: "EXIT",
            symbol,
            side: UnifiedOrderSide.SELL,
            type: UnifiedOrderType.MARKET,
            quantity,
        });
        console.log("Sell Order Response:", JSON.stringify(sellOrderResponse, null, 2));

        // Tokocrypto success status might create orderId
        expect(sellOrderResponse.orderId).toBeDefined();
    }, 30000); // 30s timeout

    // make order
});
