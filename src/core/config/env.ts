import { z } from "zod";

const schema = z.object({
  APP_ENV: z
    .enum(["development", "preview", "production", "test"])
    .default("development"),

  APP_API_KEY: z.string().min(16),

  DEFAULT_AI_PROVIDER: z
    .string()
    .default("typhoon"),

  TYPHOON_API_KEY: z.string().min(1),

  TYPHOON_BASE_URL: z
    .string()
    .url()
    .default("https://api.opentyphoon.ai/v1"),

  TYPHOON_MODEL: z
    .string()
    .default("typhoon-v2.5-30b-a3b-instruct"),

  FIREBASE_PROJECT_ID: z.string().min(1),

  FIREBASE_SERVICE_ACCOUNT_B64: z
    .string()
    .optional(),

  GEMINI_API_KEY: z.string().min(1),

  EMBEDDING_MODEL: z
    .string()
    .default("gemini-embedding-001"),

  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .min(128)
    .max(2048)
    .default(768),
});

const result = schema.safeParse({
  APP_ENV:
    process.env.APP_ENV ??
    process.env.VERCEL_ENV ??
    "development",

  APP_API_KEY:
    process.env.APP_API_KEY,

  DEFAULT_AI_PROVIDER:
    process.env.DEFAULT_AI_PROVIDER,

  TYPHOON_API_KEY:
    process.env.TYPHOON_API_KEY,

  TYPHOON_BASE_URL:
    process.env.TYPHOON_BASE_URL,

  TYPHOON_MODEL:
    process.env.TYPHOON_MODEL,

  FIREBASE_PROJECT_ID:
    process.env.FIREBASE_PROJECT_ID,

  FIREBASE_SERVICE_ACCOUNT_B64:
    process.env.FIREBASE_SERVICE_ACCOUNT_B64,

  GEMINI_API_KEY:
  process.env.GEMINI_API_KEY,

  EMBEDDING_MODEL:
    process.env.EMBEDDING_MODEL,

  EMBEDDING_DIMENSIONS:
    process.env.EMBEDDING_DIMENSIONS,
});

if (!result.success) {
  const issues = result.error.issues
    .map(
      (issue) =>
        `${issue.path.join(".")}: ${issue.message}`,
    )
    .join("; ");

  throw new Error(
    `Invalid server environment variables: ${issues}`,
  );
}



export const env = result.data;