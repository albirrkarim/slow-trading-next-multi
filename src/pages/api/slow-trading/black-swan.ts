import type { NextApiRequest, NextApiResponse } from "next";
import slowTrading from "@/lib/slowTrading";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    if (req.body?.action !== "acknowledge-recovery") {
      res.status(400).json({ error: "Unknown Black Swan action" });
      return;
    }
    const state = await slowTrading.blackSwan.recovery.acknowledge();
    res.status(200).json({ state });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Action failed",
    });
  }
}
