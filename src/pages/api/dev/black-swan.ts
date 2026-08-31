import { isDevBacktestEnabled } from "@/lib/env/devBacktest";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isDevBacktestEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { default: blackSwanBacktestHandler } =
    await import("@/lib/devBacktest/api/blackSwanBacktest");
  await blackSwanBacktestHandler(req, res);
}
