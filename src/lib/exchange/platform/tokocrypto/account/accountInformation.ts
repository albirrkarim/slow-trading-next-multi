import { requestPrivate } from "../utils";

export interface AccountAsset {
  asset: string;
  free: string;
  locked: string;
}

export interface AccountInfoResponse {
  code: number;
  msg: string;
  data: {
    makerCommission: string;
    takerCommission: string;
    buyerCommission: string;
    sellerCommission: string;
    canTrade: number;
    canWithdraw: number;
    canDeposit: number;
    accountAssets: AccountAsset[];
  };
  timestamp: number;
}

/**
 * Retrieves current spot account information from Tokocrypto.
 *
 * Includes details about trading permissions, commission rates,
 * and a list of asset balances.
 *
 * @returns {Promise<AccountInfoResponse>} Account details including commissions, permissions, and asset balances.
 */
export async function accountInformation(): Promise<AccountInfoResponse> {
  return await requestPrivate("/open/v1/account/spot", {}, "get");
}
