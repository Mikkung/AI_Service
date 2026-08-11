import { env } from "@/core/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "ise-ai-service",
    environment: env.APP_ENV,
    provider: env.DEFAULT_AI_PROVIDER,
    timestamp: new Date().toISOString(),
  });
}
