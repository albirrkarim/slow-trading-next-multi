import { createCoinTagStore } from "@/lib/devBacktest/coins/tags";
import { EMPTY_COIN_RESULT_FILTERS } from "@/lib/devBacktest/coins/filter-config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    fs.rmSync(folder, { force: true, recursive: true });
  }
});

describe("coin tag storage", () => {
  it("persists reusable tags and normalized coin relations in SQLite", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "coin-tags-"));
    temporaryFolders.push(folder);
    const store = createCoinTagStore(path.join(folder, "tags.sqlite"));

    store.setCoinTags("sol_usdt", ["Reviewed", "Low Risk", "reviewed"]);
    store.setCoinTags("ETH", ["Reviewed"]);
    store.setCoinDescription("sol_usdt", "  Strong ecosystem and liquidity.  ");
    expect(store.list()).toMatchObject({
      coinDescriptions: { SOL: "Strong ecosystem and liquidity." },
      coinTags: { ETH: ["Reviewed"], SOL: ["Low Risk", "Reviewed"] },
      tags: [
        {
          color: "#1976d2",
          coins: ["SOL"],
          description: "",
          text: "Low Risk",
        },
        {
          color: "#1976d2",
          coins: ["ETH", "SOL"],
          description: "",
          text: "Reviewed",
        },
      ],
    });

    const reviewed = store
      .list()
      .tags.find((tag) => tag.text === "Reviewed");
    expect(reviewed).toBeDefined();
    store.updateTag(
      reviewed!.tagId,
      "Manually reviewed",
      "#ff9800",
      "Human checked setup",
      {
        filters: {
          holdDurationMaxMaxHours: "24",
          maxLevelAbsolute: "6",
        },
        requiredTags: ["Low Risk"],
      },
    );
    expect(store.list()).toMatchObject({
      coinTags: {
        ETH: ["Manually reviewed"],
        SOL: ["Low Risk", "Manually reviewed"],
      },
      tags: expect.arrayContaining([
        {
          color: "#ff9800",
          coins: ["ETH", "SOL"],
          description: "Human checked setup",
          filters: {
            filters: expect.objectContaining({
              holdDurationMaxMaxHours: "24",
              maxLevelAbsolute: "6",
            }),
            requiredTags: ["Low Risk"],
          },
          tagId: reviewed!.tagId,
          text: "Manually reviewed",
        },
      ]),
    });

    store.setCoinTags("SOL", ["Low Risk"]);
    expect(store.list()).toMatchObject({
      coinTags: { ETH: ["Manually reviewed"], SOL: ["Low Risk"] },
    });
    store.setManyCoinTags({
      ETH: [],
      INJ: ["Low Risk"],
      SOL: ["Low Risk", "Momentum"],
    });
    expect(store.list()).toMatchObject({
      coinDescriptions: { SOL: "Strong ecosystem and liquidity." },
      coinTags: { INJ: ["Low Risk"], SOL: ["Low Risk", "Momentum"] },
    });
    store.deleteTag(reviewed!.tagId);
    expect(store.list().coinTags).toEqual({
      INJ: ["Low Risk"],
      SOL: ["Low Risk", "Momentum"],
    });
    store.setCoinDescription("SOL", "");
    expect(store.list().coinDescriptions).toEqual({});
    store.close();
  });

  it("migrates existing tag databases with a default color", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "coin-tags-legacy-"));
    temporaryFolders.push(folder);
    const databasePath = path.join(folder, "tags.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE tags (
        tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL COLLATE NOCASE UNIQUE
      );
      CREATE TABLE coin_tags (
        coin_name TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (coin_name, tag_id),
        FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
      );
      INSERT INTO tags(text) VALUES ('Legacy');
    `);
    legacy.close();

    const store = createCoinTagStore(databasePath);
    expect(store.list().tags).toMatchObject([
      { color: "#1976d2", description: "", filters: null, text: "Legacy" },
    ]);
    store.close();
  });

  it("replaces the store from a synced metadata snapshot", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "coin-tags-sync-"));
    temporaryFolders.push(folder);
    const store = createCoinTagStore(path.join(folder, "tags.sqlite"));

    store.setCoinTags("SOL", ["Old"]);
    store.replaceState({
      coinDescriptions: { INJ: "Synced description" },
      coinTags: { INJ: ["Momentum"], SOL: ["Reviewed"] },
      tags: [
        {
          color: "#ff9800",
          coins: [],
          description: "Fast mover",
          filters: {
            filters: { ...EMPTY_COIN_RESULT_FILTERS, maxLevelAbsolute: "6" },
            requiredTags: [],
          },
          tagId: 10,
          text: "Momentum",
        },
        {
          color: "#4caf50",
          coins: [],
          description: "",
          tagId: 11,
          text: "Reviewed",
        },
      ],
    });

    // PROD:COIN_METADATA_SYNC
    expect(store.list()).toMatchObject({
      coinDescriptions: { INJ: "Synced description" },
      coinTags: { INJ: ["Momentum"], SOL: ["Reviewed"] },
      tags: [
        {
          color: "#ff9800",
          description: "Fast mover",
          filters: {
            filters: expect.objectContaining({ maxLevelAbsolute: "6" }),
            requiredTags: [],
          },
          tagId: 10,
          text: "Momentum",
        },
        { color: "#4caf50", description: "", tagId: 11, text: "Reviewed" },
      ],
    });
    store.close();
  });
});
