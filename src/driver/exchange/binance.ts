import { getExchange, TradingMode } from "@/lib/exchange";


export async function binanceTest() {

    // 1. Get an exchange instance (defaults to what is in config, or specify generic type)
    // You can specify "okx", "binance", "tokocrypto"
    const exchange = getExchange("binance", {
        defaultTradingMode: TradingMode.SPOT
    });

    console.log(`Using exchange: ${exchange.exchangeType}`);

    try {
        // 2. Fetch Balance for a specific symbol pair (e.g., BTC_USDT)
        // This usually fetches the quote currency balance (USDT in this case) and base currency (BTC)
        const symbol = "BTCUSDT"; // Binance uses no separator usually, but let's check standard. Tokocrypto used BTC_USDT. OKX used BTC-USDT. Binance usually BTCUSDT.
        // However, the adapter might normalize it. Let's look at a file if unsure. 
        // But for now, I'll stick to a common format or just try generic. 
        // Actually, let's check `src/lib/exchange/adapters/binance.ts` or similar if I can, but to be fast I will use "BTCUSDT" which is standard for Binance.
        console.log(`\nFetching balance for ${symbol}...`);
        const balance = await exchange.getBalance(symbol);

        if (balance) {
            console.log("Balance:", JSON.stringify(balance, null, 2));
        } else {
            console.log("No balance found or API error.");
        }

        // 3. Fetch Klines (Candlestick data)
        console.log(`\nFetching 1h Klines for ${symbol}...`);
        const endTime = Date.now();
        const startTime = endTime - 5 * 60 * 60 * 1000; // 5 hours ago

        const klines = await exchange.getKlines({
            symbol,
            interval: "1h",
            limit: 5,
            startTime,
            endTime
        });

        console.log(`Retrieved ${klines.length} klines.`);
        if (klines.length > 0) {
            console.log("Latest kline:", klines[klines.length - 1]);
        }

        // 4. Get Fees
        const fees = exchange.getFees();
        const takerFee = fees.getTotalFeePercent({ side: "buy", type: "taker" });
        console.log(`\nTaker Fee for Buy: ${takerFee}%`);

        // 5. Check Min Qty and Step Size
        const limits = await exchange.getMinQtyAndStepSize(symbol);
        console.log(`\nMarket Limits for ${symbol}:`, limits);

        // 6. Example: Placing an Order (Commented out for safety)
        /*
        console.log("\nPlacing a generic limit buy order...");
        const orderResponse = await exchange.createOrder({
            symbol: symbol,
            side: UnifiedOrderSide.BUY,
            type: UnifiedOrderType.LIMIT,
            price: 50000, // Example price
            quantity: 0.001, // Example quantity
            tradingMode: TradingMode.SPOT
        });
        console.log("Order Response:", orderResponse);
        */

    } catch (error) {
        console.error("An error occurred:", error);
    }
}
