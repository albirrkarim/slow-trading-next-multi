import dotenv from "dotenv";

dotenv.config();

export const API_KEY = process.env.OKX_API_KEY ?? "";
export const API_SECRET = process.env.OKX_API_SECRET ?? "";
export const API_PASSPHRASE = process.env.OKX_API_PASSPHRASE ?? "";
export const BASE_URL = "https://www.okx.com";
