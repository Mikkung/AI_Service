import { z } from "zod";

const optionalConfigValue = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const schema = z.object({
  APP_ENV: z
    .enum(["development", "preview", "production", "test"])
    .default("development"),

  APP_API_KEY: z.string().min(16),

  LINE_CHANNEL_SECRET: z
    .string()
    .min(1),

  LINE_CHANNEL_ACCESS_TOKEN: z
    .string()
    .min(1),

  FACEBOOK_APP_SECRET: optionalConfigValue,
  FACEBOOK_VERIFY_TOKEN: optionalConfigValue,
  FACEBOOK_PAGE_ACCESS_TOKEN: optionalConfigValue,
  FACEBOOK_PAGE_ID: optionalConfigValue,
  FACEBOOK_GRAPH_API_VERSION: optionalConfigValue,

  STAFF_ALLOWED_EMAILS: optionalConfigValue,
  STAFF_AUTH_SESSION_SECRET: optionalConfigValue,
  ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED: z.preprocess(
    (value) => value === "" || value === undefined
      ? "true"
      : value,
    z.enum(["true", "false"]),
  ),
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalConfigValue,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: optionalConfigValue,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalConfigValue,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalConfigValue,

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

  LINE_CHANNEL_SECRET:
    process.env.LINE_CHANNEL_SECRET,

  LINE_CHANNEL_ACCESS_TOKEN:
    process.env.LINE_CHANNEL_ACCESS_TOKEN,

  FACEBOOK_APP_SECRET:
    process.env.FACEBOOK_APP_SECRET,
  FACEBOOK_VERIFY_TOKEN:
    process.env.FACEBOOK_VERIFY_TOKEN,
  FACEBOOK_PAGE_ACCESS_TOKEN:
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
  FACEBOOK_PAGE_ID:
    process.env.FACEBOOK_PAGE_ID,
  FACEBOOK_GRAPH_API_VERSION:
    process.env.FACEBOOK_GRAPH_API_VERSION,

  STAFF_ALLOWED_EMAILS:
    process.env.STAFF_ALLOWED_EMAILS,
  STAFF_AUTH_SESSION_SECRET:
    process.env.STAFF_AUTH_SESSION_SECRET,
  ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED:
    process.env.ADMIN_UI_LEGACY_KEY_LOGIN_ENABLED,
  NEXT_PUBLIC_FIREBASE_API_KEY:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,

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
