import { requestPrivate } from "../utils";

const BINANCE_SPOT_API_URL = "https://api.binance.com";
const WITHDRAWAL_SETTLEMENT_POLL_MS = 1_000;
const WITHDRAWAL_SETTLEMENT_TIMEOUT_MS = 45_000;
const TRANSIENT_WITHDRAWAL_RETRY_DELAY_MS = 2_000;

export interface BinanceWithdrawUSDTParams {
  address: string;
  amountUSDT: number;
  network?: string;
  /** Ensures Spot has the requested amount by transferring any Futures shortfall. */
  transferFromFutures?: boolean;
  withdrawOrderId?: string;
}

export interface BinanceWithdrawResponse {
  id: string;
  /** Amount moved internally from USDⓈ-M Futures to Spot before withdrawal. */
  transferredFromFuturesUSDT?: number;
  /** Binance universal-transfer id when an internal transfer was required. */
  transferId?: number;
}

interface BinanceSpotAccountResponse {
  balances?: Array<{
    asset: string;
    free: string;
  }>;
}

interface BinanceFuturesBalance {
  asset: string;
  availableBalance: string;
}

interface BinanceApiRestrictions {
  enableInternalTransfer?: boolean;
  permitsUniversalTransfer?: boolean;
}

interface BinanceUniversalTransferResponse {
  tranId: number;
}

interface BinanceCoinConfig {
  coin: string;
  free: string;
}

/** Waits without blocking the SLOW process event loop. */
async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWithdrawalAmount(amountUSDT: number): string {
  return amountUSDT
    .toFixed(6)
    .replace(/\.?0+$/, "");
}

/** Calculates the Futures-to-Spot shortfall without transferring twice on retry. */
function getSpotShortfallUSDT(
  requestedAmountUSDT: number,
  spotAvailableUSDT: number,
): number {
  return Math.max(
    0,
    Number((requestedAmountUSDT - spotAvailableUSDT).toFixed(6)),
  );
}

/** Ensures Spot can fund a withdrawal by moving its shortfall from USDⓈ-M Futures. */
async function ensureSpotUSDTFromFutures(
  requestedAmountUSDT: number,
): Promise<BinanceUniversalTransferResponse & { amountUSDT: number } | null> {
  const spotAccount = await requestPrivate<BinanceSpotAccountResponse>(
    "/api/v3/account",
    {},
    "get",
    BINANCE_SPOT_API_URL,
  );
  const spotAvailableUSDT = Math.max(
    0,
    Number(
      spotAccount.balances?.find((balance) => balance.asset === "USDT")?.free,
    ) || 0,
  );
  const shortfallUSDT = getSpotShortfallUSDT(
    requestedAmountUSDT,
    spotAvailableUSDT,
  );

  // PROD:FUTURES_WITHDRAWAL_TRANSFER
  if (!(shortfallUSDT > 0)) {
    return null;
  }

  const restrictions = await requestPrivate<BinanceApiRestrictions>(
    "/sapi/v1/account/apiRestrictions",
    {},
    "get",
    BINANCE_SPOT_API_URL,
  );

  if (!restrictions.permitsUniversalTransfer) {
    throw new Error(
      'Binance API key is not authorized for the Futures-to-Spot transfer. Enable "Permits Universal Transfer" in Binance API Management and save the API key settings.',
    );
  }

  const futuresBalances = await requestPrivate<BinanceFuturesBalance[]>(
    "/fapi/v2/balance",
    {},
    "get",
    "https://fapi.binance.com",
  );
  const futuresAvailableUSDT = Math.max(
    0,
    Number(
      futuresBalances.find((balance) => balance.asset === "USDT")
        ?.availableBalance,
    ) || 0,
  );

  if (futuresAvailableUSDT < shortfallUSDT) {
    throw new Error(
      `Binance Futures available balance (${futuresAvailableUSDT} USDT) is lower than the ${shortfallUSDT} USDT required for withdrawal.`,
    );
  }

  const transfer = await requestPrivate<BinanceUniversalTransferResponse>(
    "/sapi/v1/asset/transfer",
    {
      amount: normalizeWithdrawalAmount(shortfallUSDT),
      asset: "USDT",
      type: "UMFUTURE_MAIN",
    },
    "post",
    BINANCE_SPOT_API_URL,
    { postParamsInQuery: true },
  );

  return {
    ...transfer,
    amountUSDT: shortfallUSDT,
  };
}

/** Gets USDT that Binance's withdrawal wallet currently recognizes as free. */
async function getWithdrawableUSDT(): Promise<number> {
  const coins = await requestPrivate<BinanceCoinConfig[]>(
    "/sapi/v1/capital/config/getall",
    {},
    "get",
    BINANCE_SPOT_API_URL,
  );

  return Math.max(
    0,
    Number(coins.find((coin) => coin.coin === "USDT")?.free) || 0,
  );
}

/** Waits for Binance's withdrawal service to recognize a completed transfer. */
async function waitForWithdrawableUSDT(requestedAmountUSDT: number): Promise<void> {
  const deadline = Date.now() + WITHDRAWAL_SETTLEMENT_TIMEOUT_MS;
  let availableUSDT = await getWithdrawableUSDT();

  while (availableUSDT < requestedAmountUSDT && Date.now() < deadline) {
    await delay(WITHDRAWAL_SETTLEMENT_POLL_MS);
    availableUSDT = await getWithdrawableUSDT();
  }

  if (availableUSDT < requestedAmountUSDT) {
    throw new Error(
      `Binance Futures-to-Spot transfer did not become withdrawable within ${WITHDRAWAL_SETTLEMENT_TIMEOUT_MS / 1000} seconds. Spot withdrawal balance is ${availableUSDT} USDT; ${requestedAmountUSDT} USDT is required.`,
    );
  }
}

/** Checks the Binance error emitted while a new Spot asset is still settling. */
function isTransientCurrencyOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("code: -4024");
}

export function normalizeBinanceUSDTNetwork(network: string): string {
  const value = String(network || "").trim().toUpperCase();
  const code = value.match(/^([A-Z0-9]+)\s+-\s+/)?.[1] ?? value;
  const aliases: Record<string, string> = {
    BEP20: "BSC",
    ERC20: "ETH",
    POLYGON: "MATIC",
    TRC20: "TRX",
  };

  return aliases[code] ?? code;
}

export async function withdrawUSDT(
  params: BinanceWithdrawUSDTParams,
): Promise<BinanceWithdrawResponse> {
  const amountUSDT = Number(params.amountUSDT);
  const address = String(params.address || "").trim();
  const network = params.network
    ? normalizeBinanceUSDTNetwork(params.network)
    : undefined;

  if (!(amountUSDT > 0)) {
    throw new Error("Binance USDT withdrawal amount must be greater than 0.");
  }

  if (!address) {
    throw new Error("Binance USDT withdrawal address is required.");
  }

  const transfer = params.transferFromFutures
    ? await ensureSpotUSDTFromFutures(amountUSDT)
    : null;

  if (transfer) {
    // PROD:FUTURES_WITHDRAWAL_SETTLEMENT
    await waitForWithdrawableUSDT(amountUSDT);
  }

  const withdrawalParams = {
    coin: "USDT",
    address,
    amount: normalizeWithdrawalAmount(amountUSDT),
    network,
    withdrawOrderId:
      params.withdrawOrderId ?? `slow-withdraw-${Date.now()}`.slice(0, 64),
  };

  let withdrawal: BinanceWithdrawResponse;
  try {
    withdrawal = await requestPrivate<BinanceWithdrawResponse>(
      "/sapi/v1/capital/withdraw/apply",
      withdrawalParams,
      "post",
      BINANCE_SPOT_API_URL,
      { postParamsInQuery: true },
    );
  } catch (error) {
    if (!transfer || !isTransientCurrencyOwnershipError(error)) {
      throw error;
    }

    await delay(TRANSIENT_WITHDRAWAL_RETRY_DELAY_MS);
    withdrawal = await requestPrivate<BinanceWithdrawResponse>(
      "/sapi/v1/capital/withdraw/apply",
      withdrawalParams,
      "post",
      BINANCE_SPOT_API_URL,
      { postParamsInQuery: true },
    );
  }

  return {
    ...withdrawal,
    ...(transfer
      ? {
          transferredFromFuturesUSDT: transfer.amountUSDT,
          transferId: transfer.tranId,
        }
      : {}),
  };
}
