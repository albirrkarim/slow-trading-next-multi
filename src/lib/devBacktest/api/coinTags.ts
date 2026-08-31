import coinTags from "@/lib/devBacktest/coins/tags";
import { coinMetadataSync } from "@/lib/devBacktest/coins/tag-sync";
import type { CoinTagState } from "@/lib/devBacktest/coins/tag-types";
import type { NextApiRequest, NextApiResponse } from "next";

async function sendSyncedResponse(
  res: NextApiResponse,
  status: number,
  state: CoinTagState,
) {
  void coinMetadataSync.broadcast(state);
  res.status(status).json(state);
}

export default async function coinTagsHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      res.status(200).json(coinTags.list());
      return;
    }

    if (req.method === "POST") {
      await sendSyncedResponse(
        res,
        201,
        coinTags.create(
          String(req.body?.text ?? ""),
          String(req.body?.color ?? ""),
          String(req.body?.description ?? ""),
          req.body?.filters,
        ),
      );
      return;
    }

    if (req.method === "PUT") {
      if (Object.hasOwn(req.body ?? {}, "syncState")) {
        if (
          !coinMetadataSync.isAuthorized(req.headers[coinMetadataSync.header])
        ) {
          res.status(401).json({ error: "Invalid coin metadata sync token" });
          return;
        }

        res
          .status(200)
          .json(coinTags.replace(req.body?.syncState as CoinTagState));
        return;
      }

      if (Object.hasOwn(req.body ?? {}, "coinTags")) {
        const assignments =
          req.body?.coinTags && typeof req.body.coinTags === "object"
            ? Object.fromEntries(
              Object.entries(req.body.coinTags).map(([symbol, tags]) => [
                symbol,
                Array.isArray(tags) ? tags.map(String) : [],
              ]),
            )
            : {};
        await sendSyncedResponse(res, 200, coinTags.setMany(assignments));
        return;
      }

      const symbol = String(req.body?.symbol ?? "");
      if (Object.hasOwn(req.body ?? {}, "description")) {
        await sendSyncedResponse(
          res,
          200,
          coinTags.setDescription(symbol, String(req.body?.description ?? "")),
        );
        return;
      }
      const tags = Array.isArray(req.body?.tags)
        ? req.body.tags.map(String)
        : [];
      await sendSyncedResponse(res, 200, coinTags.set(symbol, tags));
      return;
    }

    if (req.method === "PATCH") {
      await sendSyncedResponse(
        res,
        200,
        coinTags.update(
          Number(req.body?.tagId),
          String(req.body?.text ?? ""),
          String(req.body?.color ?? ""),
          String(req.body?.description ?? ""),
          Object.hasOwn(req.body ?? {}, "filters")
            ? req.body?.filters
            : undefined,
        ),
      );
      return;
    }

    if (req.method === "DELETE") {
      await sendSyncedResponse(
        res,
        200,
        coinTags.delete(Number(req.body?.tagId)),
      );
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "PATCH", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Coin tags failed",
    });
  }
}
