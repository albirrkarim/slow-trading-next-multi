import { requestPrivate } from "../utils";

export interface GetPositionsParams {
  instType?: "MARGIN" | "SWAP" | "FUTURES" | "OPTION";
  instId?: string;
  posId?: string;
}

export interface PositionData {
  instId: string;
  posSide: string; // long, short, net
  pos: string; // Position size
  availPos: string;
  avgPx: string;
  liqPx: string;
  mgnMode: string;
  leverage?: string; // Mapped from lever?? RAW log had "lever"
  lever?: string;
  liab?: string;
  liabCcy?: string;
  upl?: string;
  margin?: string;
  mgnRatio?: string;
  notionalUsd?: string;
  cTime: string;
  uTime: string;
}

export interface GetPositionsResponse {
  code: string;
  msg: string;
  data: PositionData[];
}

/**
 * Get Positions
 * API: GET /api/v5/account/positions
 */
export async function getPositions(
  params: GetPositionsParams,
): Promise<GetPositionsResponse> {
  const query: any = {};
  if (params.instType) query.instType = params.instType;
  if (params.instId) query.instId = params.instId;
  if (params.posId) query.posId = params.posId;

  return requestPrivate<GetPositionsResponse>(
    "/api/v5/account/positions",
    query,
    "GET",
  );
}
