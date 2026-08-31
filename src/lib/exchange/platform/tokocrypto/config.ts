import dotenv from "dotenv";

dotenv.config();

export const API_KEY = process.env.TOKOCRYPTO_API_KEY ?? "";
export const API_SECRET = process.env.TOKOCRYPTO_API_SECRET ?? "";
export const BASE_URL = "https://www.tokocrypto.com";
