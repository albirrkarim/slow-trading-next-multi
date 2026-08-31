import blackSwanBacktest, {
  type BlackSwanSavingsBacktestInput,
} from "@/lib/devBacktest/black-swan";
import blackSwan from "@/lib/trading/black-swan";
import { tradeLog } from "@/lib/trading/helper/log";
import type { NextApiRequest, NextApiResponse } from "next";

const INCIDENT_START_T = Date.parse("2025-10-10T18:00:00.000Z");
const INCIDENT_END_T = Date.parse("2025-10-11T12:00:00.000Z");

export const config = {
  api: {
    responseLimit: false,
  },
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

/** Runs the date-bounded candle and savings comparison used by Settings. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  // PROD:BLACK_SWAN_SAVINGS_PREVIEW_RESOURCE_GUARD
  const abortController = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) abortController.abort();
  };
  const tradeLogSession = tradeLog.startSession({
    muted: true,
    verbose: false,
  });
  req.once("aborted", abortOnDisconnect);
  res.once("close", abortOnDisconnect);

  try {
    const body = (req.body ?? {}) as Partial<BlackSwanSavingsBacktestInput>;
    if (!body.tradingConfig || !Array.isArray(body.tradingConfig.symbols)) {
      throw new Error("The current trading configuration is required.");
    }
    const startTime = Number(body.startTime);
    const endTime = Number(body.endTime);
    const result = await blackSwanBacktest.savings.run({
      config: blackSwan.config.normalize(body.config),
      endTime: Number.isFinite(endTime) ? endTime : INCIDENT_END_T,
      monitoringConfig: body.monitoringConfig,
      signal: abortController.signal,
      startTime: Number.isFinite(startTime) ? startTime : INCIDENT_START_T,
      startingBalanceUSDT: Number(body.startingBalanceUSDT),
      symbols: body.tradingConfig.symbols,
      tradingConfig: body.tradingConfig,
      useCache: body.useCache !== false,
    });
    abortController.signal.throwIfAborted();
    res.status(200).json(result);
  } catch (error) {
    if (isAbortError(error)) {
      if (!res.destroyed && !res.writableEnded) res.status(499).end();
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : "Savings preview failed",
    });
  } finally {
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
    abortController.abort();
    tradeLog.endSession(tradeLogSession);
  }
}
