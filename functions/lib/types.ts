export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  STT_BRIDGE_URL?: string;
  STT_BRIDGE_HMAC?: string;
  MAX_AI_WORDS?: string;
  RATE_LIMIT_PER_HOUR?: string;
  DAILY_WARNING_USD?: string;
  MODEL_INPUT_USD_PER_MILLION?: string;
  MODEL_OUTPUT_USD_PER_MILLION?: string;
}
export interface Data { env: Env; request: Request; params: Record<string, string>; }
