import { getExchange, TradingMode, UnifiedOrderSide, UnifiedOrderType } from "@/lib/exchange";
import { okx } from "@/lib/exchange/platform/okx";

export async function executeFuturesTrade() {
    console.log("=== OKX Futures Trading Example ===");
    console.log("Goal: Short XAUT (Betting price goes down)");

    // 1. Initialize Exchange
    const exchange = getExchange("okx", {
        defaultTradingMode: TradingMode.FUTURES
    });

    try {
        console.log("\n--- Account Config Check ---");
        const config = await okx.account.getAccountConfiguration();
        if (config) {
            console.log(`Account Level: ${config.acctLv} (1=Simple, 2=Single, 3=Multi, 4=Portfolio)`);
            console.log(`Position Mode: ${config.posMode}`);

            if (config.acctLv === "1") {
                console.warn("⚠️  Account is in 'Simple' mode (Spot Only). Attempting to upgrade to 'Single-currency margin'...");

                try {
                    const upgraded = await okx.account.setAccountLevel("2");
                    if (upgraded) {
                        console.log("✅ Auto-upgrade successful! Proceeding with trade...");
                    } else {
                        throw new Error("Failed to auto-upgrade account mode.");
                    }
                } catch (e) {
                    console.error("❌ ERROR: Could not upgrade account mode.");
                    console.error("   Reason: " + ((e as any).message || "Unknown"));
                    console.error("   Most likely, you need to pass a knowledge quiz on the OKX website/app first.");
                    console.error("   Go to: Trade -> Settings -> Account Mode -> Select 'Single-currency margin' manually.");
                    return;
                }
            }
        } else {
            console.warn("Could not fetch account config, proceeding blindly...");
        }

        const symbol = "XAUT_USDT_SWAP"; // Valid OKX Swap Symbol (Unified)

        // 2. Verify Collateral (USDT)
        // Since we are trading a Linear Swap (USDT-Margined), we check USDT balance.
        // In the unified lib, getBalance usually returns { baseAsset, quoteAsset } for a pair.
        // For Swaps, it's a bit ambiguous what "base/quote" means in generic getBalance context,
        // so we check the "USDT" balance directly or via the Spot pair.
        // Let's check "XAUT_USDT" (spot) to see our USDT holdings in the Trading account.
        const balance = await exchange.getBalance("XAUT_USDT");
        const usdtAvailable = balance?.quoteAsset || 0;

        console.log(`\nYour USDT Balance: ${usdtAvailable.toFixed(2)} USDT`);

        if (usdtAvailable < 5) {
            console.error("❌ CRTICAL: USDT balance is too low (< $5). You need at least ~$5-10.");
            return;
        }

        // 3. Get Current Price
        // We use tick size to format price correctly later if using Limit orders,
        // but for Market orders we just need to know the price for estimation.
        // const _tickSize = await exchange.getTickSize(symbol);
        const klines = await exchange.getKlines({ symbol, interval: "1m", limit: 1 });
        const currentPrice = parseFloat(klines[0][4] as string);

        console.log(`Current XAUT Price: ${currentPrice} USDT`);

        // 4. Set Leverage
        const leverage = 2;
        console.log(`\nSetting leverage to ${leverage}x...`);
        const leverageSet = await exchange.setLeverage(symbol, leverage);
        if (!leverageSet) {
            console.warn("⚠️  Could not set leverage. Defaulting to existing account setting.");
        } else {
            console.log("✅ Leverage set successfully.");
        }

        // 5. Determine Quantity
        // OKX Swaps use "Contracts" as the unit for 'quantity'.
        // For XAUT-USDT-SWAP, 1 Contract = 0.001 XAUT (approx $4.50 USD).
        // User has $9.56. 
        // 1 Contract costs ~$4.50 margin/value (at 1x leverage).
        // 2 Contracts cost ~$9.00 margin/value.
        // Safe bet: Start with 1 Contract.
        const quantityContracts = 1;

        console.log(`\nPreparing to Short (Sell) ${quantityContracts} Contract(s)...`);
        console.log(`Notional Value: ~$${(quantityContracts * 0.001 * currentPrice).toFixed(2)} USDT`);

        // 5. Execute Trade (SHORT)
        // Order Side: SELL (to Open Short)
        // Order Type: MARKET (simplest, immediate fill)

        /* 
           ⚠️ UNCOMMENT THE BLOCKS BELOW TO EXECUTE REAL ORDERS 
        */

        const orderResponse = await exchange.createOrder({
            tradeType: "ENTRY",
            symbol,
            side: UnifiedOrderSide.SELL,
            type: UnifiedOrderType.MARKET,
            quantity: quantityContracts,
            tradingMode: TradingMode.FUTURES
        });

        console.log("✅ Order Placed Successfully!");
        console.log("Order ID:", orderResponse.orderId);
        console.log("Status:", orderResponse.status);
        console.log(JSON.stringify(orderResponse, null, 2));


        // 6. How to Close the Position?
        // To close a Short, you BUY the same quantity.

        console.log("\n... Waiting 5 seconds then closing (example) ...");
        // await new Promise(r => setTimeout(r, 120000));

        // const closeResponse = await exchange.createOrder({
        //     symbol: symbol,
        //     side: UnifiedOrderSide.BUY, // BUY to Close
        //     type: UnifiedOrderType.MARKET,
        //     quantity: quantityContracts, // Same amount to flat position
        //     tradingMode: TradingMode.FUTURES
        // });
        // console.log("✅ Position Closed:", closeResponse.orderId);


    } catch (error) {
        console.error("❌ Trade Failed:", error);
    }
}
