import { tradeLog } from "@/lib/trading/helper/log";
import crypto from "crypto";
import fs from "fs-extra";

import { type DynamicTradeAlgorithm } from "@lib/brain/algorithms";
import type { BacktestConfigDynamic, BacktestReturnDynamic } from "../type-backtest";

const BACKTEST_DYNAMIC = "storage/datasets/UI_TEMP/BACKTEST_DYNAMIC";

function generateMD5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex").substring(0, 5);
}

export interface CacheId {
  symbols: string[];
  range: string;
  config: BacktestConfigDynamic;

  algorithm: DynamicTradeAlgorithm;
  startTime?: number;
  endTime?: number;
  mode: string;
}

export async function saveOrGetBacktestResult({
  id,
  res,
}: {
  id: CacheId;
  res?: BacktestReturnDynamic;
}): Promise<BacktestReturnDynamic | null> {
  if (id && !res) {
    const symbols = id.symbols;
    const symbolPath = symbols.join("-");

    const hashParms = generateMD5(JSON.stringify(id));

    // tradeLog.log("hashParms", hashParms);

    const base = `${BACKTEST_DYNAMIC}/${symbolPath}/${hashParms}`;

    if (await fs.exists(`${base}/all.json`)) {
      return (await fs.readJson(`${base}/all.json`)) as BacktestReturnDynamic;
    }

    return null;
  }

  if (!res) {
    return null;
  }

  const symbols = res.symbols;
  const symbolPath = symbols.join("-");

  const hashParms = generateMD5(JSON.stringify(id));

  const base = `${BACKTEST_DYNAMIC}/${symbolPath}/${hashParms}`;

  await fs.ensureDir(base);

  const tradeHistoryMapFolder = `${base}/tradeHistoryMap`;

  for (const item of Object.keys(res.backtestPack.tradeHistoryMap)) {
    await fs.ensureDir(tradeHistoryMapFolder);

    await fs.writeJSON(
      `${tradeHistoryMapFolder}/${item}.json`,
      res.backtestPack.tradeHistoryMap[item]
    );
  }

  // growth
  await fs.writeJSON(
    `${base}/growthOvertime.json`,
    res.backtestPack.growthOvertime
  );

  // Final model memory map
  await fs.writeJSON(
    `${base}/modelMemoryMap.json`,
    res.backtestPack.modelMemoryMap
  );

  // save the config to reproduce
  await fs.writeJSON(`${base}/config.json`, id);

  //   await fs.writeJSON(
  //     `${base}/modelMemoryOvertime.json`,
  //     res.modelMemoryOvertime
  //   );

  tradeLog.log("start balance ", res.startingBalanceUSDT);
  tradeLog.log("safeHaven ", res.dynamicTradeMemory.safeHaven);
  tradeLog.log("finalBalance ", res.finalBalance);

  const totalAset = res.finalBalance + res.dynamicTradeMemory.safeHaven;
  tradeLog.log("Total asset ", totalAset);

  tradeLog.log(
    "Gain ",
    (
      ((totalAset - res.startingBalanceUSDT) / res.startingBalanceUSDT) *
      100
    ).toFixed(2),
    "%"
  );

  tradeLog.log("res.totalTrades ", res.totalTrades);

  tradeLog.log("SAVE TO base", base);
  tradeLog.log("hashParms", hashParms);
  await fs.writeJSON(`${base}/all.json`, res);

  return res;
}
