import crypto from "node:crypto";

import coinTags from "@/lib/devBacktest/coins/tags";
import { coinMetadataSync } from "@/lib/devBacktest/coins/tag-sync";
import type { CoinTagState } from "@/lib/devBacktest/coins/tag-types";

import slowTradingBalanceSummary from "./balance-summary";
import slowTradingFinanceSummary from "./finance-summary";
import slowTradingStorage from "./storage";
import {
  SLOW_TRADING_MCP_PERMISSIONS,
  type SlowTradingMcpPermission,
  type SlowTradingMcpPublicTokenRecord,
  type SlowTradingMcpTokenRecord,
  type SlowTradingMode,
} from "./types";

const WRITE_TOOL_NOTICE =
  "WRITE TOOL: Before calling this tool, show the user a draft of exactly what will change and ask for confirmation.";

const PERMISSION_SET = new Set<string>(SLOW_TRADING_MCP_PERMISSIONS);
const TOKEN_SECRET_ENCRYPTION_VERSION = "v1";

interface SlowTradingMcpToolDefinition {
  name: string;
  description: string;
  permission: SlowTradingMcpPermission;
  inputSchema: Record<string, unknown>;
  readOnlyHint?: boolean;
}

interface SlowTradingMcpAuthenticatedToken {
  token: SlowTradingMcpTokenRecord;
  permissions: Set<SlowTradingMcpPermission>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getMcpAppName() {
  return String(process.env.APP_NAME ?? "unknown").trim() || "unknown";
}

function getMcpServerName() {
  return `slow-trading-next:${getMcpAppName()}`;
}

function getMcpInstructions() {
  return [
    `This MCP server controls the SLOW app instance named "${getMcpAppName()}".`,
    "Use slow_balance_read for the canonical USDT balance object and its field meanings. Its totalAsset value is available plus locked margin, not floating equity or unrealized P&L.",
    "Before calling any write tool, show the user the exact draft change and ask for confirmation.",
  ].join(" ");
}

function createTokenId() {
  return crypto.randomUUID();
}

function createRawToken() {
  return `slow_mcp_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getTokenSecretEncryptionKey() {
  const secret = String(
    process.env.MCP_TOKEN_ENCRYPTION_SECRET ??
      process.env.DASHBOARD_PIN ??
      "",
  ).trim();
  if (!secret) {
    throw new Error(
      "MCP_TOKEN_ENCRYPTION_SECRET or DASHBOARD_PIN is required to save revealable MCP tokens.",
    );
  }

  return crypto
    .createHash("sha256")
    .update(
      `slow-trading-mcp-token:${secret}:${process.env.DASHBOARD_PIN_SALT ?? ""}`,
    )
    .digest();
}

/** Encrypts an MCP token secret so settings can reveal it again without storing plaintext. */
function encryptTokenSecret(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getTokenSecretEncryptionKey(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_SECRET_ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/** Decrypts a saved MCP token secret for authenticated settings reveal. */
function decryptTokenSecret(encryptedToken: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = encryptedToken.split(":");
  if (
    version !== TOKEN_SECRET_ENCRYPTION_VERSION ||
    !ivRaw ||
    !tagRaw ||
    !encryptedRaw
  ) {
    throw new Error("MCP token secret is not revealable.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getTokenSecretEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function safeEqualHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizePermissionsInput(value: unknown): SlowTradingMcpPermission[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((permission) => String(permission))
        .filter((permission): permission is SlowTradingMcpPermission =>
          PERMISSION_SET.has(permission),
        ),
    ),
  );
}

function toPublicToken(
  token: SlowTradingMcpTokenRecord,
): SlowTradingMcpPublicTokenRecord {
  const {
    tokenHash: _tokenHash,
    tokenSecretEncrypted: _tokenSecretEncrypted,
    ...publicToken
  } = token;
  return {
    ...publicToken,
    secretAvailable: Boolean(token.tokenSecretEncrypted),
  };
}

async function loadTokens() {
  const storage = await slowTradingStorage.data.load({ modeScope: "active" });
  return storage.runtime.mcp.tokens;
}

async function saveTokens(tokens: SlowTradingMcpTokenRecord[]) {
  const storage = await slowTradingStorage.data.update({
    mcp: {
      tokens,
    },
  });
  return storage.runtime.mcp.tokens;
}

async function listMcpTokens() {
  return (await loadTokens()).map(toPublicToken);
}

/** Creates a hashed MCP token and returns the raw secret exactly once. */
async function createMcpToken(params: {
  name: string;
  permissions: SlowTradingMcpPermission[];
}) {
  const rawToken = createRawToken();
  const token: SlowTradingMcpTokenRecord = {
    id: createTokenId(),
    name: params.name.trim().slice(0, 80) || "MCP token",
    enabled: true,
    permissions: normalizePermissionsInput(params.permissions),
    tokenHash: hashToken(rawToken),
    tokenSecretEncrypted: encryptTokenSecret(rawToken),
    createdAt: Date.now(),
  };
  const tokens = await saveTokens([...(await loadTokens()), token]);

  return {
    token: rawToken,
    record: toPublicToken(tokens.find((item) => item.id === token.id) ?? token),
  };
}

async function updateMcpToken(params: {
  id: string;
  name?: string;
  enabled?: boolean;
  permissions?: SlowTradingMcpPermission[];
}) {
  const tokens = await loadTokens();
  let found = false;
  const nextTokens = tokens.map((token) => {
    if (token.id !== params.id) return token;
    found = true;
    return {
      ...token,
      name:
        params.name === undefined
          ? token.name
          : params.name.trim().slice(0, 80) || "MCP token",
      enabled:
        typeof params.enabled === "boolean" ? params.enabled : token.enabled,
      permissions:
        params.permissions === undefined
          ? token.permissions
          : normalizePermissionsInput(params.permissions),
    };
  });
  if (!found) throw new Error("MCP token not found");
  return (await saveTokens(nextTokens)).map(toPublicToken);
}

async function deleteMcpToken(id: string) {
  const tokens = await loadTokens();
  const nextTokens = tokens.filter((token) => token.id !== id);
  if (nextTokens.length === tokens.length) {
    throw new Error("MCP token not found");
  }
  return (await saveTokens(nextTokens)).map(toPublicToken);
}

async function revealMcpToken(id: string) {
  const token = (await loadTokens()).find((item) => item.id === id);
  if (!token) throw new Error("MCP token not found");
  return decryptTokenSecret(token.tokenSecretEncrypted);
}

async function authenticateMcpToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const tokens = await loadTokens();
  const token = tokens.find(
    (item) =>
      item.enabled &&
      item.tokenHash.length === tokenHash.length &&
      safeEqualHash(item.tokenHash, tokenHash),
  );

  if (!token) return null;

  const touchedTokens = tokens.map((item) =>
    item.id === token.id ? { ...item, lastUsedAt: Date.now() } : item,
  );
  await saveTokens(touchedTokens);

  return {
    token,
    permissions: new Set(token.permissions),
  } satisfies SlowTradingMcpAuthenticatedToken;
}

function assertPermission(
  auth: SlowTradingMcpAuthenticatedToken,
  permission: SlowTradingMcpPermission,
) {
  if (!auth.permissions.has(permission)) {
    throw new Error(`MCP token is missing permission: ${permission}`);
  }
}

function jsonSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const toolDefinitions: SlowTradingMcpToolDefinition[] = [
  {
    name: "slow_tags_list",
    description:
      "List reusable coin tags, their descriptions, filter JSON, and assigned coin symbols.",
    permission: "tags.read",
    readOnlyHint: true,
    inputSchema: jsonSchema({}),
  },
  {
    name: "slow_tags_create",
    description: `${WRITE_TOOL_NOTICE} Create one reusable coin tag.`,
    permission: "tags.write",
    inputSchema: jsonSchema(
      {
        text: { type: "string", description: "Tag name." },
        color: { type: "string", description: "Hex color, for example #00ff00." },
        description: { type: "string", description: "Optional tag description." },
        filters: {
          type: ["object", "null"],
          description: "Optional coin filter JSON stored on the tag.",
        },
      },
      ["text", "color"],
    ),
  },
  {
    name: "slow_tags_update",
    description: `${WRITE_TOOL_NOTICE} Update one reusable coin tag, including its optional filters JSON.`,
    permission: "tags.write",
    inputSchema: jsonSchema(
      {
        tagId: { type: "number", description: "Existing tag id." },
        text: { type: "string", description: "Tag name." },
        color: { type: "string", description: "Hex color, for example #00ff00." },
        description: { type: "string", description: "Optional tag description." },
        filters: {
          type: ["object", "null"],
          description: "Optional coin filter JSON stored on the tag.",
        },
      },
      ["tagId", "text", "color"],
    ),
  },
  {
    name: "slow_tags_delete",
    description: `${WRITE_TOOL_NOTICE} Delete one reusable coin tag and all coin attachments for it.`,
    permission: "tags.write",
    inputSchema: jsonSchema(
      {
        tagId: { type: "number", description: "Existing tag id." },
      },
      ["tagId"],
    ),
  },
  {
    name: "slow_coin_metadata_get",
    description:
      "Read coin descriptions and tag attachments. Pass a symbol to return only one coin.",
    permission: "coin_metadata.read",
    readOnlyHint: true,
    inputSchema: jsonSchema({
      symbol: {
        type: "string",
        description: "Optional coin symbol, for example BTC.",
      },
    }),
  },
  {
    name: "slow_coin_metadata_update",
    description: `${WRITE_TOOL_NOTICE} Update one coin description and/or replace its attached tags. This auto-broadcasts through the current coin metadata sync behavior.`,
    permission: "coin_metadata.write",
    inputSchema: jsonSchema(
      {
        symbol: { type: "string", description: "Coin symbol, for example BTC." },
        description: {
          type: "string",
          description: "Optional description. Empty string clears it.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional replacement tag names for this coin.",
        },
      },
      ["symbol"],
    ),
  },
  {
    name: "slow_coin_metadata_broadcast",
    description:
      "Manually broadcast the current coin metadata state to configured/manual peer instances.",
    permission: "coin_metadata.broadcast",
    inputSchema: jsonSchema({
      peers: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional peer origins. Defaults to the project manual broadcast peers.",
      },
    }),
  },
  {
    name: "slow_balance_read",
    description:
      "Read the canonical SLOW USDT balance object. Returns available exchange-free balance, spendable capital, virtual reserve, Safe Haven, locked active-position margin, total asset, formulas, and a plain-language meaning for every field. totalAsset is available plus locked and is not floating equity or unrealized P&L.",
    permission: "balance.read",
    readOnlyHint: true,
    inputSchema: jsonSchema({
      mode: {
        type: "string",
        enum: ["active", "live", "sandbox"],
        description:
          "Balance mode. active uses the current app mode; live attempts an exchange refresh; sandbox uses simulated state. Defaults to active.",
      },
    }),
  },
  {
    name: "slow_finance_summary",
    description:
      "Summarize realized net USDT P&L from closed SLOW trades inside one bounded UTC date range. Balance changes and open-position unrealized P&L are excluded.",
    permission: "trade_history.read",
    readOnlyHint: true,
    inputSchema: jsonSchema(
      {
        start: {
          type: "string",
          description: "Inclusive UTC start date in YYYY-MM-DD format.",
        },
        end: {
          type: "string",
          description: "Inclusive UTC end date in YYYY-MM-DD format.",
        },
        mode: {
          type: "string",
          enum: ["live", "sandbox"],
          description: "Trading mode. Defaults to live.",
        },
      },
      ["start", "end"],
    ),
  },
  {
    name: "slow_trade_history_read",
    description:
      "Read SLOW trade history and open positions from the current storage snapshot.",
    permission: "trade_history.read",
    readOnlyHint: true,
    inputSchema: jsonSchema({
      mode: {
        type: "string",
        enum: ["active", "live", "sandbox"],
        description: "History mode. Defaults to active.",
      },
      symbol: {
        type: "string",
        description: "Optional symbol filter, for example BTC.",
      },
      limit: {
        type: "number",
        description: "Maximum closed history rows to return. Defaults to 50.",
      },
      includeOpenPositions: {
        type: "boolean",
        description: "Whether to include open positions. Defaults to true.",
      },
    }),
  },
];

function getAllowedTools(auth: SlowTradingMcpAuthenticatedToken) {
  return toolDefinitions.filter((tool) => auth.permissions.has(tool.permission));
}

function getMcpToolList(auth: SlowTradingMcpAuthenticatedToken) {
  const appName = getMcpAppName();
  return getAllowedTools(auth).map((tool) => ({
    name: tool.name,
    description: `SLOW app "${appName}". ${tool.description}`,
    inputSchema: tool.inputSchema,
    _meta: {
      "slowTrading/appName": appName,
    },
    annotations: {
      readOnlyHint: tool.readOnlyHint === true,
      destructiveHint: tool.readOnlyHint !== true,
    },
  }));
}

function pickCoinMetadata(state: CoinTagState, symbol?: string) {
  const normalizedSymbol = symbol?.trim().toUpperCase().replace(/_?USDT$/, "");
  if (!normalizedSymbol) return state;

  return {
    coinDescriptions: state.coinDescriptions[normalizedSymbol]
      ? {
          [normalizedSymbol]: state.coinDescriptions[normalizedSymbol],
        }
      : {},
    coinTags: {
      [normalizedSymbol]: state.coinTags[normalizedSymbol] ?? [],
    },
    tags: state.tags,
  };
}

async function callMcpTool(params: {
  auth: SlowTradingMcpAuthenticatedToken;
  name: string;
  arguments: Record<string, unknown>;
}) {
  const args = params.arguments ?? {};

  if (params.name === "slow_tags_list") {
    assertPermission(params.auth, "tags.read");
    return coinTags.list();
  }

  if (params.name === "slow_tags_create") {
    assertPermission(params.auth, "tags.write");
    const state = coinTags.create(
      String(args.text ?? ""),
      String(args.color ?? ""),
      String(args.description ?? ""),
      Object.hasOwn(args, "filters") ? args.filters : undefined,
    );
    void coinMetadataSync.broadcast(state);
    return state;
  }

  if (params.name === "slow_tags_update") {
    assertPermission(params.auth, "tags.write");
    const state = coinTags.update(
      Number(args.tagId),
      String(args.text ?? ""),
      String(args.color ?? ""),
      String(args.description ?? ""),
      Object.hasOwn(args, "filters") ? args.filters : undefined,
    );
    void coinMetadataSync.broadcast(state);
    return state;
  }

  if (params.name === "slow_tags_delete") {
    assertPermission(params.auth, "tags.write");
    const state = coinTags.delete(Number(args.tagId));
    void coinMetadataSync.broadcast(state);
    return state;
  }

  if (params.name === "slow_coin_metadata_get") {
    assertPermission(params.auth, "coin_metadata.read");
    return pickCoinMetadata(coinTags.list(), String(args.symbol ?? ""));
  }

  if (params.name === "slow_coin_metadata_update") {
    assertPermission(params.auth, "coin_metadata.write");
    const symbol = String(args.symbol ?? "");
    let state = coinTags.list();
    if (Object.hasOwn(args, "description")) {
      state = coinTags.setDescription(symbol, String(args.description ?? ""));
    }
    if (Object.hasOwn(args, "tags")) {
      const tagTexts = Array.isArray(args.tags) ? args.tags.map(String) : [];
      state = coinTags.set(symbol, tagTexts);
    }
    void coinMetadataSync.broadcast(state);
    return pickCoinMetadata(state, symbol);
  }

  if (params.name === "slow_coin_metadata_broadcast") {
    assertPermission(params.auth, "coin_metadata.broadcast");
    const state = coinTags.list();
    const peers = Array.isArray(args.peers)
      ? args.peers.map(String)
      : coinMetadataSync.manualPeers;
    return {
      peers,
      results: await coinMetadataSync.broadcastToPeers(state, peers),
    };
  }

  if (params.name === "slow_balance_read") {
    // PROD:MCP_BALANCE
    assertPermission(params.auth, "balance.read");
    const storage = await slowTradingStorage.data.load({
      includeHistory: true,
      modeScope: "all",
    });
    const activeMode = slowTradingStorage.mode.getActive(storage);
    const requestedMode = String(args.mode ?? "active");
    const mode: SlowTradingMode =
      requestedMode === "live" || requestedMode === "sandbox"
        ? requestedMode
        : activeMode;
    const selectedStorage = cloneJson(storage);
    selectedStorage.runtime.sandboxEnabled = mode === "sandbox";
    const dashboardState =
      await slowTradingStorage.dashboard.buildStateRealtime(selectedStorage);

    return slowTradingBalanceSummary.create({
      activeMode,
      dashboardState,
      instanceName: getMcpAppName(),
      mode,
    });
  }

  if (params.name === "slow_trade_history_read") {
    assertPermission(params.auth, "trade_history.read");
    const storage = await slowTradingStorage.data.load({ includeHistory: true });
    const activeMode = slowTradingStorage.mode.getActive(storage);
    const requestedMode = String(args.mode ?? "active");
    const mode: SlowTradingMode =
      requestedMode === "live" || requestedMode === "sandbox"
        ? requestedMode
        : activeMode;
    const symbol = String(args.symbol ?? "").trim().toUpperCase();
    const limit = Math.min(500, Math.max(1, Number(args.limit) || 50));
    const includeOpenPositions = args.includeOpenPositions !== false;
    const history = slowTradingStorage.history
      .getClosed(storage, mode)
      .filter((position) => !symbol || position.symbol === symbol)
      .slice(-limit)
      .reverse();
    const openPositions = includeOpenPositions
      ? slowTradingStorage.history
          .getOpen(storage, mode)
          .filter((position) => !symbol || position.symbol === symbol)
      : [];

    return cloneJson({
      activeMode,
      mode,
      history,
      openPositions,
      totalClosed: slowTradingStorage.history
        .getClosed(storage, mode)
        .filter((position) => !symbol || position.symbol === symbol).length,
    });
  }

  if (params.name === "slow_finance_summary") {
    // PROD:MCP_FINANCE_SUMMARY
    assertPermission(params.auth, "trade_history.read");
    const mode: SlowTradingMode = args.mode === "sandbox" ? "sandbox" : "live";
    const storage = await slowTradingStorage.data.load({ includeHistory: true });

    return slowTradingFinanceSummary.create({
      end: String(args.end ?? ""),
      instanceName: getMcpAppName(),
      mode,
      positions: slowTradingStorage.history.getClosed(storage, mode),
      start: String(args.start ?? ""),
    });
  }

  throw new Error(`Unknown MCP tool: ${params.name}`);
}

const slowTradingMcp = {
  identity: {
    getAppName: getMcpAppName,
    getInstructions: getMcpInstructions,
    getServerName: getMcpServerName,
  },
  permissions: SLOW_TRADING_MCP_PERMISSIONS,
  tokens: {
    authenticate: authenticateMcpToken,
    create: createMcpToken,
    delete: deleteMcpToken,
    list: listMcpTokens,
    reveal: revealMcpToken,
    update: updateMcpToken,
  },
  tools: {
    call: callMcpTool,
    catalog: () =>
      toolDefinitions.map((tool) => ({
        description: tool.description,
        name: tool.name,
        permission: tool.permission,
        readOnly: tool.readOnlyHint === true,
      })),
    list: getMcpToolList,
  },
} as const;

export default slowTradingMcp;
