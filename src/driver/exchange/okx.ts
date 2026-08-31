import { getExchange, TradingMode } from "@/lib/exchange";
import { executeFuturesTrade } from "./futures-trade";

export async function okxTest() {

    // 1. Get an exchange instance (defaults to what is in config, or specify generic type)
    // You can specify "okx", "binance", "tokocrypto"
    const exchange = getExchange("okx", {
        defaultTradingMode: TradingMode.SPOT
    });

    console.log(`Using exchange: ${exchange.exchangeType}`);

    try {

        await executeFuturesTrade();
        // 2. Fetch Balance for a specific symbol pair (e.g., BTC_USDT)
        // This usually fetches the quote currency balance (USDT in this case) and base currency (BTC)
        // const symbol = "XAUT_USDT";
        // console.log(`\nFetching balance for ${symbol}...`);
        // const balance = await exchange.getBalance(symbol);


        // if (balance) {
        //     console.log("Balance:", JSON.stringify(balance, null, 2));
        // } else {
        //     console.log("No balance found or API error.");
        // }

        // // 3. Fetch Klines (Candlestick data)
        // console.log(`\nFetching 1h Klines for ${symbol}...`);
        // const endTime = Date.now();
        // const startTime = endTime - 5 * 60 * 60 * 1000; // 5 hours ago

        // const klines = await exchange.getKlines({
        //     symbol: symbol,
        //     interval: "1h",
        //     limit: 5,
        //     startTime,
        //     endTime
        // });

        // console.log(`Retrieved ${klines.length} klines.`);
        // if (klines.length > 0) {
        //     console.log("Latest kline:", klines[klines.length - 1]);
        // }

        // // 4. Get Fees
        // const fees = exchange.getFees();
        // const takerFee = fees.getTotalFeePercent({ side: "buy", type: "taker" });
        // console.log(`\nTaker Fee for Buy: ${takerFee}%`);

        // // 5. Check Min Qty and Step Size
        // const limits = await exchange.getMinQtyAndStepSize(symbol);
        // console.log(`\nMarket Limits for ${symbol}:`, limits);

        // // Get Instrument Info for Price Precision (Tick Size)
        // const tickSize = await exchange.getTickSize(symbol);
        // console.log(`Tick Size used for Price: ${tickSize}`);

        // 6. Sell XAUT for $3 USDT (Commented out)
        /*
        // We need to calculate the quantity of XAUT to sell.
        // Quantity = Target USDT / Price


        // --- START TRANSFER LOGIC ---
        // Check where the funds are
        // This helper method is specific to OKX Adapter to handle Funding -> Trading transfer
        if (exchange instanceof OKXAdapter) {
            await exchange.checkAndTransferFunds(symbol);
        }
        // --- END TRANSFER LOGIC ---

        let price = 0;
        if (klines.length > 0) {
            price = parseFloat(klines[klines.length - 1][4] as string); // Close price
        } else {
            // Fallback or fetch ticker if klines empty
            console.log("No price data available.");
            return;
        }

        const targetUsdt = 5; // Increased to $5 to meet min limit (~$4.5)
        // Calculate quantity: $5 / price
        // e.g. 5 / 4489 = 0.0011
        const rawQuantity = targetUsdt / price;

        // Apply precision (step size)
        // From limits: stepSize: 1e-7 (0.0000001)
        const stepSize = limits.stepSize;

        // Calculate decimal places from stepSize
        const qtyDecimals = Math.abs(Math.log10(stepSize));
        const quantity = parseFloat((Math.floor(rawQuantity / stepSize) * stepSize).toFixed(qtyDecimals));

        // Format Price to Tick Size precision
        const priceDecimals = Math.abs(Math.log10(tickSize));
        const formattedPrice = parseFloat(price.toFixed(priceDecimals));

        console.log(`\nSelling $${targetUsdt} worth of ${symbol}`);
        console.log(`Current Price: ${price} -> Formatted: ${formattedPrice}`);
        console.log(`Calculated Quantity: ${quantity} (Raw: ${rawQuantity})`);

        if (quantity < limits.minQty) {
            console.error(`Error: Quantity ${quantity} is below minimum limit ${limits.minQty}`);
            return;
        }

        console.log("Placing Limit Sell Order...");
        // Using Limit order at current price (effectively market, but safer control)
        // Or could use MARKET type.

        const orderResponse = await exchange.createOrder({
            symbol: symbol,
            side: UnifiedOrderSide.SELL,
            type: UnifiedOrderType.LIMIT,
            price: formattedPrice, // Send number, adapter handles string conversion
            quantity: quantity,
            tradingMode: TradingMode.SPOT
        });

        console.log("Order Response:", JSON.stringify(orderResponse, null, 2));
        */

        // 7. Get Open Orders & Cancel
        // console.log(`\nFetching Open Orders for ${symbol}...`);
        // const openOrders = await exchange.getOpenOrders(symbol);

        // console.log(`Found ${openOrders.length} open orders.`);

        // if (openOrders.length > 0) {
        //     const orderToCancel = openOrders[0];
        //     console.log("Order to Cancel:", JSON.stringify(orderToCancel, null, 2));

        //     console.log(`\nCancelling Order ID: ${orderToCancel.orderId}...`);
        //     try {
        //         const cancelResult = await exchange.cancelOrder(orderToCancel.orderId, symbol);
        //         if (cancelResult) {
        //             console.log("Order cancelled successfully.");
        //         } else {
        //             console.log("Failed to cancel order.");
        //         }
        //     } catch (error) {
        //         console.error("Cancel Error:", error);
        //     }
        // } else {
        //     console.log("No open orders to cancel.");
        // }

    } catch (error) {
        console.error("An error occurred:", error);
    }
}
