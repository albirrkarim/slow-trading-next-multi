import { FILES } from "@/components/storage";
import slowTradingJsonFile from "@/lib/slowTrading/storage/json-file";
import type { SlowTradingErrorLogEntry } from "@/lib/slowTrading";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";

interface AlterErrorLogStatusResult {
  changed: boolean;
  dryRun: boolean;
  records: number;
  updated: number;
}

function pickBooleanParam(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

/** Adds the required `new` status to legacy error records. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AlterErrorLogStatusResult | { error: string }>,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  const params = req.method === "GET" ? req.query : req.body;
  const dryRun = pickBooleanParam(params?.dryRun);
  const file = FILES.slow.logs.errors;

  if (!(await fs.pathExists(file))) {
    res.status(200).json({ changed: false, dryRun, records: 0, updated: 0 });
    return;
  }

  const raw = await fs.readJSON(file);
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: "Error log storage must be a JSON array." });
    return;
  }

  const updated = raw.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !("status" in entry),
  ).length;

  if (updated > 0 && !dryRun) {
    await slowTradingJsonFile.write.atomic(
      file,
      raw.map((entry) =>
        entry && typeof entry === "object" && !("status" in entry)
          ? ({ ...entry, status: "new" } satisfies SlowTradingErrorLogEntry)
          : entry,
      ),
    );
  }

  res.status(200).json({
    changed: updated > 0,
    dryRun,
    records: raw.length,
    updated,
  });
}
