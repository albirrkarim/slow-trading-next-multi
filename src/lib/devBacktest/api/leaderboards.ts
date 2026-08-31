import { FILES } from "@/components/storage";
import type { SavedPayload } from "@/components/dev/DynamicTrade/type-dynamic-report";
import { isDevBacktestEnabled } from "@/lib/env/devBacktest";
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs-extra";
import path from "path";

const MAX_HISTORY = 25;

async function readLeaderboardsFile(): Promise<SavedPayload[]> {
  const filePath = FILES.slow.leaderboards;

  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    if (!raw.trim()) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedPayload[]) : [];
  } catch {
    return [];
  }
}

async function writeLeaderboardsFile(history: SavedPayload[]): Promise<void> {
  const filePath = FILES.slow.leaderboards;
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(filePath, history);
}

function normalizeHistory(history: SavedPayload[]): SavedPayload[] {
  return history
    .filter((item) => item && typeof item.id === "string" && item.id.trim())
    .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
    .slice(0, MAX_HISTORY);
}

export default async function leaderboardsHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isDevBacktestEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    if (req.method === "GET") {
      const history = await readLeaderboardsFile();
      res.status(200).json(normalizeHistory(history));
      return;
    }

    if (req.method === "POST") {
      const entry = req.body as SavedPayload | undefined;

      if (!entry?.id) {
        res.status(400).json({ error: "Missing leaderboard id" });
        return;
      }

      const history = await readLeaderboardsFile();
      const next = normalizeHistory([
        {
          ...entry,
          createdAt: Number(entry.createdAt ?? Date.now()),
        },
        ...history.filter((item) => item.id !== entry.id),
      ]);

      await writeLeaderboardsFile(next);
      res.status(200).json(next);
      return;
    }

    if (req.method === "DELETE") {
      const rawId = (req.body?.id ?? req.query?.id) as string | undefined;
      const id = String(rawId ?? "").trim();

      if (!id) {
        res.status(400).json({ error: "Missing leaderboard id" });
        return;
      }

      const history = await readLeaderboardsFile();
      const next = history.filter((item) => item.id !== id);

      await writeLeaderboardsFile(next);
      res.status(200).json(normalizeHistory(next));
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message ?? "Failed to manage leaderboards" });
  }
}
