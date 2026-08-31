import coinFinder from "@/lib/devBacktest/coins";
import type { NextApiRequest, NextApiResponse } from "next";

function pickString(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export default async function coinFinderHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "POST") {
      const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
      const job = coinFinder.jobs.start({
        range: String(req.body?.range ?? ""),
        symbols,
        useCachedVPoints: req.body?.useCachedVPoints !== false,
      });
      res.status(202).json(job);
      return;
    }

    if (req.method === "GET" && req.query.action === "chart") {
      const data = await coinFinder.chart.get({
        range: pickString(req.query.range),
        symbol: pickString(req.query.symbol),
      });
      res.status(200).json(data);
      return;
    }

    if (req.method === "GET" && req.query.action === "volatility") {
      const data = await coinFinder.volatility.get(
        pickString(req.query.jobId),
      );
      if (!data) {
        res.status(404).json({ error: "Coin finder job not found" });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (req.method === "GET") {
      const job = coinFinder.jobs.get(pickString(req.query.jobId));
      if (!job) {
        res.status(404).json({ error: "Coin finder job not found" });
        return;
      }
      res.status(200).json(job);
      return;
    }

    if (req.method === "DELETE") {
      const job = coinFinder.jobs.cancel(pickString(req.query.jobId));
      if (!job) {
        res.status(404).json({ error: "Coin finder job not found" });
        return;
      }
      res.status(200).json(job);
      return;
    }

    res.setHeader("Allow", ["DELETE", "GET", "POST"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Coin finder failed",
    });
  }
}
