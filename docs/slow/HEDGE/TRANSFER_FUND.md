Yes. **Binance has an API to transfer USDⓈ-M Futures assets between your Master/Main account and Sub-accounts in both directions.**

The cleanest endpoint for your use case is:

```http
POST /sapi/v1/sub-account/universalTransfer
```

It is a signed Master Account endpoint, and Binance supports `USDT_FUTURE` as both the source and destination account type. ([Binance Developer Center][1])

### Main USD-M → Sub USD-M

For example, transfer **100 USDT** from your Main Futures wallet to a Sub-account Futures wallet:

```text
fromAccountType=USDT_FUTURE
toAccountType=USDT_FUTURE
toEmail=subaccount@example.com
asset=USDT
amount=100
timestamp=...
```

You **omit `fromEmail`**, because Binance treats a missing `fromEmail` as the Master/Main account. ([Binance Developer Center][1])

Conceptually:

```text
MAIN
USD-M Futures
$1000
   │
   │ transfer 100 USDT
   ▼
SUB ACCOUNT A
USD-M Futures
$100
```

### Sub USD-M → Main USD-M

Just reverse it:

```text
fromAccountType=USDT_FUTURE
toAccountType=USDT_FUTURE
fromEmail=subaccount@example.com
asset=USDT
amount=100
timestamp=...
```

Here you **omit `toEmail`**, which means the destination defaults to the Master/Main account. ([Binance Developer Center][1])

```text
SUB ACCOUNT A
USD-M Futures
$100
   │
   │ transfer 100 USDT
   ▼
MAIN
USD-M Futures
$1000
```

So the useful logic for your trading system could simply be:

```typescript
// MAIN -> SUB
{
    fromAccountType: "USDT_FUTURE",
    toAccountType: "USDT_FUTURE",
    toEmail: "sub@example.com",
    asset: "USDT",
    amount: 100
}
```

and:

```typescript
// SUB -> MAIN
{
    fromAccountType: "USDT_FUTURE",
    toAccountType: "USDT_FUTURE",
    fromEmail: "sub@example.com",
    asset: "USDT",
    amount: 100
}
```

One important requirement: the Master API key used for `universalTransfer` must have **Internal Transfer** permission enabled. Because source and destination are both `USDT_FUTURE`, Binance also requires that at least `fromEmail` or `toEmail` be provided—which matches the two examples above. ([Binance Developer Center][1])

Binance also has a dedicated Futures internal-transfer endpoint:

```http
POST /sapi/v1/sub-account/futures/internalTransfer
```

with:

```text
fromEmail
toEmail
futuresType=1
asset=USDT
amount
```

where `futuresType=1` means USDⓈ-M Futures. Binance says the Master account can make up to **2,000 of these transfers per minute**, subject to sufficient futures margin balance. ([Binance Developer Center][2])

For your automated trading architecture, I'd use **`universalTransfer`** unless you specifically need the dedicated futures-to-futures endpoint. It makes **Main ↔ Sub** routing particularly straightforward.

[1]: https://developers.binance.com/docs/sub_account/asset-management/Universal-Transfer "Asset Management - Sub Account REST API | Binance Developer Docs"
[2]: https://developers.binance.com/docs/sub_account/asset-management/Sub-account-Futures-Asset-Transfer "Asset Management - Sub Account REST API | Binance Developer Docs"
