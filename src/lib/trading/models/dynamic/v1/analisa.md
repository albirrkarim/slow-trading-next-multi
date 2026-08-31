# Dynamic model

## A. Description

This model is paired with, money management function.

This model is only buy using, volatility map

## Config Suggestion

- Cari yang koinnya itu pasti naek.

## Backtest Result

MODAL $100
C. Final sell
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 3.88%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 3.88%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.25%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.25%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -3.93%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -3.93%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -32.14%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -32.14%
⚡ Backtest for ETH, SUI, BTC, BNB, SOL, XRP, HBAR
⏱️ Total time: 1926198.49 ms (1926.20 s / 32.10 min)
📊 Average per candle: 9.1620 ms
res.finalBalance 182.16630652996875
res.totalTrades 311

MODAL $200
C. Final sell
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 4.97%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 4.97%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.86%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.86%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 3.64%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 3.64%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -2.59%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -2.59%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -29.41%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -29.41%
⚡ Backtest for ETH, SUI, BTC, BNB, SOL, XRP, HBAR
⏱️ Total time: 1963619.73 ms (1963.62 s / 32.73 min)
📊 Average per candle: 9.3400 ms
res.finalBalance 421.48526825775406
res.totalTrades 388
(base) ➜ trading-next git:

MODAL $600
C. Final sell
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 5.53%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at 5.53%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.81%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.81%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -2.41%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -2.41%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -28.81%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -28.81%
⚡ Backtest for ETH, SUI, BTC, BNB, SOL, XRP, HBAR
⏱️ Total time: 1973744.18 ms (1973.74 s / 32.90 min)
📊 Average per candle: 9.3882 ms
res.finalBalance 1301.341243140432
res.totalTrades 464

MODAL $600
C. Final sell
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.84%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -37.84%
[SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -27.55%
message [SELL] 13_Oct_2025_09_05 [FINAL_SELL] FINAL SELL hit at -27.55%
⚡ Backtest for SUI, SOL, HBAR
⏱️ Total time: 706519.51 ms (706.52 s / 11.78 min)
📊 Average per candle: 3.3606 ms
res.finalBalance 1237.3368355633659
res.totalTrades 345

## Question

- Does it battle proof on bear market?
- How much gain it is?
- How fast we can TP? when level 2, level 3, etc...
- Berapa gain per month?
- Berapa pendapatan per month?

## Analysis

Apakah banyaknya koin akan mempengaruhi Gain? ya, karena volatilitasnya

Apakah banyaknya modal akan mempengaruhi Gain? ya

Pilih koin yang high volatility. Kayak SUI, jgn BTC, karena btc akan membuat modalnya tidak efektif
const symbolsHighVolatility = ["SUI", "SOL", "HBAR"];
letss see

Apakah presentase COMMON dan HIT berpengaruh?
