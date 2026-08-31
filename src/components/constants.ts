// const COINS_UNCHECKED = [
//   // New added
//   // {
//   //   symbol: "AVAX",
//   //   description:
//   //     "Avalanche – fast smart contract platform with subnet architecture. Volatility: High",
//   // },
//   // {
//   //   symbol: "DOT",
//   //   description:
//   //     "Polkadot – interoperability protocol connecting multiple blockchains. Volatility: High",
//   // },
//   // {
//   //   symbol: "MATIC",
//   //   description:
//   //     "Polygon – Ethereum scaling solution, widely adopted for DeFi & NFTs. Volatility: High",
//   // },
//   // {
//   //   symbol: "ATOM",
//   //   description:
//   //     "Cosmos – hub for blockchain interoperability via IBC protocol. Volatility: High",
//   // },
//   // {
//   //   symbol: "NEAR",
//   //   description:
//   //     "Near Protocol – sharded PoS blockchain for dApps. Volatility: High",
//   // },
//   // {
//   //   symbol: "APT",
//   //   description:
//   //     "Aptos – Move-based L1 blockchain, high-performance infrastructure. Volatility: High",
//   // },
//   // {
//   //   symbol: "UNI",
//   //   description:
//   //     "Uniswap – leading DEX governance token, DeFi bellwether. Volatility: High",
//   // },
//   // {
//   //   symbol: "INJ",
//   //   description:
//   //     "Injective – DeFi-focused L1 for decentralized derivatives. Volatility: High",
//   // },
//   // {
//   //   symbol: "MKR",
//   //   description:
//   //     "Maker – governance token for DAI stablecoin protocol. Volatility: High",
//   // },
//   // {
//   //   symbol: "ALGO",
//   //   description:
//   //     "Algorand – pure PoS blockchain for payments & financial apps. Volatility: Medium–High",
//   // },
//   // // --- Layer 2 & scaling ---
//   // {
//   //   symbol: "ARB",
//   //   description:
//   //     "Arbitrum – leading Ethereum L2 scaling solution. Volatility: High",
//   // },
//   // {
//   //   symbol: "OP",
//   //   description:
//   //     "Optimism – Ethereum L2 using optimistic rollups. Volatility: High",
//   // },
//   // // --- AI & data tokens ---
//   // {
//   //   symbol: "FET",
//   //   description:
//   //     "Fetch.ai – AI-focused blockchain for autonomous agents. Volatility: Very High",
//   // },
//   // {
//   //   symbol: "RENDER",
//   //   description:
//   //     "Render Network – decentralized GPU rendering for creators. Volatility: High",
//   // },
//   // {
//   //   symbol: "GRT",
//   //   description:
//   //     "The Graph – indexing protocol for blockchain data queries. Volatility: High",
//   // },
//   // {
//   //   symbol: "TON",
//   //   description:
//   //     "The Open Network – originally Telegram's blockchain project. Volatility: High",
//   // },
//   // {
//   //   symbol: "HYPE",
//   //   description:
//   //     "Hyper Liquid Token – token for HyperLiquid exchange. Volatility: Very High",
//   // },
// ];

export const COINS_DETAIL = [
  // --- Large-cap / Core assets ---
  {
    symbol: "BTC",
    description:
      "Bitcoin – digital gold, store of value, base market benchmark. Volatility: Low–Medium",
  },
  {
    symbol: "ETH",
    description:
      "Ethereum – smart contract platform powering DeFi & NFTs. Volatility: Medium",
  },
  {
    symbol: "BNB",
    description:
      "Binance Coin – utility for Binance ecosystem & BNB Chain. Volatility: Medium",
  },

  // --- Smart contract platforms ---
  {
    symbol: "SOL",
    description:
      "Solana – high-speed smart contract chain, prone to network risks. Volatility: High",
  },
  {
    symbol: "ADA",
    description:
      "Cardano – research-driven blockchain, slower ecosystem growth. Volatility: Medium",
  },
  {
    symbol: "SUI",
    description:
      "Sui – next-gen scalable L1 blockchain, still early-stage. Volatility: High",
  },
  {
    symbol: "TRX",
    description:
      "Tron – dApp & content platform, moderate volatility, steady adoption. Volatility: Medium–High",
  },
  {
    symbol: "HBAR",
    description:
      "Hedera – enterprise-grade hashgraph ledger, smaller liquidity. Volatility: Medium–High",
  },

  // --- DeFi tokens ---
  {
    symbol: "LINK",
    description:
      "Chainlink – decentralized oracle network for smart contracts. Volatility: High",
  },
  {
    symbol: "AAVE",
    description:
      "Aave – DeFi lending protocol token, moves with DeFi cycles. Volatility: High",
  },

  // --- Payments / interoperability ---
  {
    symbol: "XRP",
    description:
      "Ripple – cross-border payments network, affected by regulation. Volatility: High (due to legal risk)",
  },
  {
    symbol: "XLM",
    description:
      "Stellar – payments & remittance coin, moderate price swings. Volatility: Medium",
  },

  // ...COINS_UNCHECKED,
];

export const TIME_RANGE = [
  "custom",
  "1month",
  "2month",
  "3month",
  "6month",
  "1year",
  "2year",
  "3year",
  "4year",
  "5year",
  "6year",
  "7year",
  "8year",
  "9year",
  "10year",
];

export const MODELS = [
  "passive.v4",
  "passive.v5",
  "dynamic.v1",
  "accumulator.v1",
];

export const LIMIT_VOLATILITY_POINT = 500;

/**
 * Used in production
 */
export const PRODUCTION_DECISION_ENGINE = "decision.v14"; // 300k% gain
