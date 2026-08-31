import { resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  hasActiveCoinFilterConfig,
  normalizeCoinFilterConfig,
  pruneCoinFilterConfig,
  type CoinFilterConfig,
} from "./filter-config";
import {
  DEFAULT_COIN_TAG_COLOR,
  type CoinTag,
  type CoinTagState,
} from "./tag-types";

interface TagRow {
  color: string;
  description: string;
  filtersJson: string;
  tagId: number;
  text: string;
}

interface CoinTagRow extends TagRow {
  coinName: string;
}

interface CoinDescriptionRow {
  coinName: string;
  description: string;
}

function normalizeCoinName(value: string) {
  return value.trim().toUpperCase().replace(/_?USDT$/, "");
}

function assertValidCoinName(coinName: string) {
  if (!/^[A-Z0-9]{1,20}$/.test(coinName)) {
    throw new Error("Invalid coin name");
  }
}

function normalizeTagText(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 64);
}

function normalizeTagColor(value: string) {
  const color = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error("Invalid tag color");
  return color;
}

function normalizeTagDescription(value: string) {
  return value.trim().slice(0, 1_000);
}

function normalizeUniqueTagTexts(tagTexts: string[]) {
  const uniqueTagMap = new Map<string, string>();
  for (const tagText of tagTexts.map(normalizeTagText).filter(Boolean)) {
    const key = tagText.toLocaleLowerCase();
    if (!uniqueTagMap.has(key)) uniqueTagMap.set(key, tagText);
  }
  return Array.from(uniqueTagMap.values());
}

function normalizeTagFiltersJson(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "";
  try {
    const parsed =
      typeof value === "string" && value.trim()
        ? JSON.parse(value)
        : value;
    const config = normalizeCoinFilterConfig(parsed);
    return hasActiveCoinFilterConfig(config)
      ? JSON.stringify(pruneCoinFilterConfig(config))
      : "";
  } catch {
    throw new Error("Invalid tag filters JSON");
  }
}

function parseTagFilters(value: string): CoinFilterConfig | null {
  if (!value.trim()) return null;
  try {
    const config = normalizeCoinFilterConfig(JSON.parse(value));
    return hasActiveCoinFilterConfig(config) ? config : null;
  } catch {
    return null;
  }
}

function normalizeTagId(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new Error("Invalid tag ID");
  return value;
}

/** Creates a SQLite-backed store for reusable tags and coin-tag relations. */
export function createCoinTagStore(databasePath: string) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL DEFAULT '${DEFAULT_COIN_TAG_COLOR}',
      description TEXT NOT NULL DEFAULT '',
      filters TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS coin_tags (
      coin_name TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (coin_name, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS coin_tags_coin_name_idx
      ON coin_tags(coin_name);
    CREATE TABLE IF NOT EXISTS coin_metadata (
      coin_name TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT ''
    );
  `);
  const tagColumns = database.prepare("PRAGMA table_info(tags)").all() as Array<{
    name: string;
  }>;
  if (!tagColumns.some((column) => column.name === "color")) {
    database.exec(
      `ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '${DEFAULT_COIN_TAG_COLOR}'`,
    );
  }
  if (!tagColumns.some((column) => column.name === "description")) {
    database.exec("ALTER TABLE tags ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (!tagColumns.some((column) => column.name === "filters")) {
    database.exec("ALTER TABLE tags ADD COLUMN filters TEXT NOT NULL DEFAULT ''");
  }

  function list(): CoinTagState {
    const tags = database
      .prepare(
        `SELECT tag_id AS tagId, text, color, description, filters AS filtersJson
         FROM tags
         ORDER BY text COLLATE NOCASE`,
      )
      .all() as unknown as TagRow[];
    const relations = database
      .prepare(
        `SELECT coin_tags.coin_name AS coinName, tags.text
         FROM coin_tags
         INNER JOIN tags ON tags.tag_id = coin_tags.tag_id
         ORDER BY coin_tags.coin_name, tags.text COLLATE NOCASE`,
      )
      .all() as unknown as CoinTagRow[];
    const descriptions = database
      .prepare(
        `SELECT coin_name AS coinName, description
         FROM coin_metadata
         WHERE description != ''
         ORDER BY coin_name`,
      )
      .all() as unknown as CoinDescriptionRow[];
    const coinDescriptions = Object.fromEntries(
      descriptions.map(({ coinName, description }) => [coinName, description]),
    );
    const coinTags: Record<string, string[]> = {};
    const coinsByTag = new Map<string, string[]>();

    for (const relation of relations) {
      (coinTags[relation.coinName] ??= []).push(relation.text);
      const key = relation.text.toLocaleLowerCase();
      const coins = coinsByTag.get(key) ?? [];
      coins.push(relation.coinName);
      coinsByTag.set(key, coins);
    }

    return {
      coinDescriptions,
      coinTags,
      tags: tags.map<CoinTag>((tag) => ({
        color: tag.color,
        coins: coinsByTag.get(tag.text.toLocaleLowerCase()) ?? [],
        description: tag.description,
        filters: parseTagFilters(tag.filtersJson),
        tagId: tag.tagId,
        text: tag.text,
      })),
    };
  }

  /** Saves a plain-text description for one normalized coin symbol. */
  function setCoinDescription(coinNameInput: string, descriptionInput: string) {
    const coinName = normalizeCoinName(coinNameInput);
    assertValidCoinName(coinName);
    const description = descriptionInput.trim().slice(0, 1_000);
    if (description) {
      database
        .prepare(
          `INSERT INTO coin_metadata(coin_name, description) VALUES (?, ?)
           ON CONFLICT(coin_name) DO UPDATE SET description = excluded.description`,
        )
        .run(coinName, description);
    } else {
      database
        .prepare("DELETE FROM coin_metadata WHERE coin_name = ?")
        .run(coinName);
    }
    return list();
  }

  function writeCoinTags(
    coinName: string,
    uniqueTags: string[],
    statements: {
      deleteRelations: ReturnType<DatabaseSync["prepare"]>;
      findTag: ReturnType<DatabaseSync["prepare"]>;
      insertRelation: ReturnType<DatabaseSync["prepare"]>;
      insertTag: ReturnType<DatabaseSync["prepare"]>;
    },
  ) {
    statements.deleteRelations.run(coinName);
    for (const tagText of uniqueTags) {
      statements.insertTag.run(tagText, DEFAULT_COIN_TAG_COLOR);
      const tag = statements.findTag.get(tagText) as unknown as
        | { tagId: number }
        | undefined;
      if (tag) statements.insertRelation.run(coinName, tag.tagId);
    }
  }

  function createCoinTagWriteStatements() {
    return {
      deleteRelations: database.prepare("DELETE FROM coin_tags WHERE coin_name = ?"),
      findTag: database.prepare(
        "SELECT tag_id AS tagId FROM tags WHERE text = ? COLLATE NOCASE",
      ),
      insertRelation: database.prepare(
        "INSERT OR IGNORE INTO coin_tags(coin_name, tag_id) VALUES (?, ?)",
      ),
      insertTag: database.prepare(
        "INSERT OR IGNORE INTO tags(text, color, description, filters) VALUES (?, ?, '', '')",
      ),
    };
  }

  function setCoinTags(coinNameInput: string, tagTexts: string[]) {
    const coinName = normalizeCoinName(coinNameInput);
    assertValidCoinName(coinName);
    const uniqueTags = normalizeUniqueTagTexts(tagTexts);
    const statements = createCoinTagWriteStatements();

    database.exec("BEGIN IMMEDIATE");
    try {
      writeCoinTags(coinName, uniqueTags, statements);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return list();
  }

  /** Saves many coin-tag assignments in one transaction for large scans. */
  function setManyCoinTags(coinTagsInput: Record<string, string[]>) {
    const normalizedEntries = Object.entries(coinTagsInput).map(
      ([coinNameInput, tagTextsInput]) => {
        const coinName = normalizeCoinName(coinNameInput);
        assertValidCoinName(coinName);
        return [coinName, normalizeUniqueTagTexts(tagTextsInput)] as const;
      },
    );
    const statements = createCoinTagWriteStatements();

    database.exec("BEGIN IMMEDIATE");
    try {
      for (const [coinName, uniqueTags] of normalizedEntries) {
        writeCoinTags(coinName, uniqueTags, statements);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return list();
  }

  function createTag(
    textInput: string,
    colorInput: string,
    descriptionInput = "",
    filtersInput?: unknown,
  ) {
    const text = normalizeTagText(textInput);
    if (!text) throw new Error("Tag text is required");
    const color = normalizeTagColor(colorInput);
    const description = normalizeTagDescription(descriptionInput);
    const filtersJson = normalizeTagFiltersJson(filtersInput);
    database
      .prepare(
        "INSERT INTO tags(text, color, description, filters) VALUES (?, ?, ?, ?)",
      )
      .run(text, color, description, filtersJson);
    return list();
  }

  function updateTag(
    tagId: number,
    textInput: string,
    colorInput: string,
    descriptionInput = "",
    filtersInput?: unknown,
  ) {
    const normalizedTagId = normalizeTagId(tagId);
    const text = normalizeTagText(textInput);
    if (!text) throw new Error("Tag text is required");
    const color = normalizeTagColor(colorInput);
    const description = normalizeTagDescription(descriptionInput);
    const result =
      filtersInput === undefined
        ? database
            .prepare(
              "UPDATE tags SET text = ?, color = ?, description = ? WHERE tag_id = ?",
            )
            .run(text, color, description, normalizedTagId)
        : database
            .prepare(
              "UPDATE tags SET text = ?, color = ?, description = ?, filters = ? WHERE tag_id = ?",
            )
            .run(
              text,
              color,
              description,
              normalizeTagFiltersJson(filtersInput),
              normalizedTagId,
            );
    if (result.changes === 0) throw new Error("Tag not found");
    return list();
  }

  function deleteTag(tagId: number) {
    const normalizedTagId = normalizeTagId(tagId);
    const result = database
      .prepare("DELETE FROM tags WHERE tag_id = ?")
      .run(normalizedTagId);
    if (result.changes === 0) throw new Error("Tag not found");
    return list();
  }

  /**
   * Replaces the whole metadata store with a normalized remote snapshot.
   */
  function replaceState(state: CoinTagState) {
    const tags = Array.isArray(state.tags) ? state.tags : [];
    const coinTags =
      state.coinTags && typeof state.coinTags === "object"
        ? state.coinTags
        : {};
    const coinDescriptions =
      state.coinDescriptions && typeof state.coinDescriptions === "object"
        ? state.coinDescriptions
        : {};

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("DELETE FROM coin_tags").run();
      database.prepare("DELETE FROM coin_metadata").run();
      database.prepare("DELETE FROM tags").run();

      const insertTag = database.prepare(
        "INSERT INTO tags(tag_id, text, color, description, filters) VALUES (?, ?, ?, ?, ?)",
      );
      const insertTagAuto = database.prepare(
        "INSERT INTO tags(text, color, description, filters) VALUES (?, ?, ?, ?)",
      );
      const findTag = database.prepare(
        "SELECT tag_id AS tagId FROM tags WHERE text = ? COLLATE NOCASE",
      );
      const insertRelation = database.prepare(
        "INSERT OR IGNORE INTO coin_tags(coin_name, tag_id) VALUES (?, ?)",
      );
      const insertDescription = database.prepare(
        "INSERT INTO coin_metadata(coin_name, description) VALUES (?, ?)",
      );

      for (const tag of tags) {
        const text = normalizeTagText(tag.text);
        if (!text) continue;
        const color = normalizeTagColor(tag.color || DEFAULT_COIN_TAG_COLOR);
        const description = normalizeTagDescription(tag.description ?? "");
        const filtersJson = normalizeTagFiltersJson(tag.filters);
        const tagId = Number(tag.tagId);
        if (Number.isInteger(tagId) && tagId > 0) {
          insertTag.run(tagId, text, color, description, filtersJson);
        } else {
          insertTagAuto.run(text, color, description, filtersJson);
        }
      }

      for (const [coinNameInput, descriptionInput] of Object.entries(
        coinDescriptions,
      )) {
        const coinName = normalizeCoinName(coinNameInput);
        if (!/^[A-Z0-9]{1,20}$/.test(coinName)) continue;
        const description = String(descriptionInput ?? "").trim().slice(0, 1_000);
        if (description) insertDescription.run(coinName, description);
      }

      for (const [coinNameInput, tagTextsInput] of Object.entries(coinTags)) {
        const coinName = normalizeCoinName(coinNameInput);
        if (!/^[A-Z0-9]{1,20}$/.test(coinName)) continue;
        const tagTexts = Array.isArray(tagTextsInput) ? tagTextsInput : [];
        for (const tagTextInput of tagTexts) {
          const tagText = normalizeTagText(String(tagTextInput ?? ""));
          if (!tagText) continue;
          const tag = findTag.get(tagText) as unknown as
            | { tagId: number }
            | undefined;
          if (tag) insertRelation.run(coinName, tag.tagId);
        }
      }

      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return list();
  }

  return {
    close: () => database.close(),
    createTag,
    deleteTag,
    list,
    replaceState,
    setCoinDescription,
    setManyCoinTags,
    setCoinTags,
    updateTag,
  };
}

let defaultStore: ReturnType<typeof createCoinTagStore> | undefined;

function getDefaultStore() {
  defaultStore ??= createCoinTagStore(
    path.join(resolvePersistentStorageRoot(), "dev", "coin-tags.sqlite"),
  );
  return defaultStore;
}

const coinTags = {
  create: (
    text: string,
    color: string,
    description = "",
    filters?: unknown,
  ) => getDefaultStore().createTag(text, color, description, filters),
  delete: (tagId: number) => getDefaultStore().deleteTag(tagId),
  list: () => getDefaultStore().list(),
  replace: (state: CoinTagState) => getDefaultStore().replaceState(state),
  setDescription: (coinName: string, description: string) =>
    getDefaultStore().setCoinDescription(coinName, description),
  setMany: (assignments: Record<string, string[]>) =>
    getDefaultStore().setManyCoinTags(assignments),
  set: (coinName: string, tags: string[]) =>
    getDefaultStore().setCoinTags(coinName, tags),
  update: (
    tagId: number,
    text: string,
    color: string,
    description = "",
    filters?: unknown,
  ) => getDefaultStore().updateTag(tagId, text, color, description, filters),
};

export default coinTags;
