import {
  type DynamicBTestDataset,
  leaderboardsEval,
} from "@/__dev__/evaluate/leaderboards";
import { commonEvaluation } from "@/components/api/dynamic";
import { PRODUCTION_DECISION_ENGINE } from "@/components/constants";
import { FOLDER } from "@/components/storage";
import { DECISION_ENGINE_MAP } from "@lib/brain/algorithms/v4/decisions";
import makeLeaderboard from "@/lib/evaluate/analysis/leaderboard";
import { tradeLog } from "@/lib/trading";
import dotenv from "dotenv";
import fs from "fs-extra";
import { runBacktestVolatilityDynamic } from "@/lib/dynamic/backtest-volatility";

dotenv.config({ quiet: true });

describe("playground backtest leaderboard evaluation", () => {
  beforeAll(() => {
    tradeLog.setVerbose(false);
  });

  test("compares cached leaderboard snapshots against the current engine", async () => {
    const files = await fs.readdir(FOLDER.production.btest);
    const grouped: Record<string, any[]> = {};

    for (const file of files) {
      const fullPath = `${FOLDER.production.btest}/${file}`;
      const data = (await fs.readJson(fullPath)) as DynamicBTestDataset;

      const cached = await runBacktestVolatilityDynamic({
        ...data.input,
        decisionEngine: DECISION_ENGINE_MAP[PRODUCTION_DECISION_ENGINE],
      });

      const evaluation = commonEvaluation(data.input.symbols, cached);
      const leaderboards = await makeLeaderboard({
        backtestReturn: cached,
        BASE_COMMON_TIME_FOLDER: data.BASE_COMMON_TIME_FOLDER,
        stability: evaluation.stability,
      });

      leaderboardsEval(grouped, leaderboards, data.leaderboards, file);
    }

    if (Object.keys(grouped).length > 0) {
      let total = 0;

      for (const rows of Object.values(grouped)) {
        total += rows.length;
      }

      throw new Error(
        `Found ${total} mismatched metrics across ${Object.keys(grouped).length} files`,
      );
    }
  });
});
