import { z } from "zod";
import { ChatOrchestrator } from "@/core/chat/chat-orchestrator";
import { hasValidApiKey } from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userId: z.string().trim().min(1).max(200).optional(),
  channel: z.enum(["test", "web", "line", "facebook", "teams"]).default("test"),
  message: z.string().trim().min(1).max(4_000),
});

const orchestrator = new ChatOrchestrator();

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid request.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await orchestrator.execute(parsed.data);
    return Response.json({ ok: true, ...result });
  } catch (error) {
  console.error("POST /api/chat failed", error);

  const message =
    error instanceof Error ? error.message : "Unknown error";

  return Response.json(
    {
      ok: false,
      error: "The AI service could not complete the request.",
      details:
        process.env.NODE_ENV === "development"
          ? message
          : undefined,
    },
    { status: 502 },
  );
}
}
