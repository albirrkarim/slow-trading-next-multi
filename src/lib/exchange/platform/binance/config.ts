import dotenv from "dotenv";

dotenv.config();

const isFuture = process.env.BINANCE_FUTURE === "true";
export const API_KEY = process.env.BINANCE_API_KEY || "";
export const API_SECRET =
  process.env.BINANCE_SECRET_KEY || process.env.BINANCE_API_SECRET || "";
export const BASE_URL = isFuture
  ? "https://fapi.binance.com"
  : "https://api.binance.com";
