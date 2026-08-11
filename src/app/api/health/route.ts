import { createHash } from "node:crypto";
import { env } from "@/core/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKeyFingerprint = createHash("sha256")
    .update(env.APP_API_KEY)
    .digest("hex")
    .slice(0, 12);

  return Response.json({
    ok: true,
    service: "ise-ai-service",
    environment: env.APP_ENV,
    provider: env.DEFAULT_AI_PROVIDER,
    appApiKeyLength: env.APP_API_KEY.length,
    appApiKeyFingerprint: apiKeyFingerprint,
    timestamp: new Date().toISOString(),
  });
}