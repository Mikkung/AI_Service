import {
  z,
} from "zod";

import {
  ChatOrchestrator,
} from "@/core/chat/chat-orchestrator";

import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export const runtime = "nodejs";
export const dynamic =
  "force-dynamic";

const requestSchema = z.object({
  sessionId:
    z.string().uuid().optional(),
  message:
    z.string()
      .trim()
      .min(1)
      .max(4_000),
});

const orchestrator =
  new ChatOrchestrator();

export async function POST(
  request: Request,
) {
  if (
    !hasValidAdminUiSession(
      request,
    )
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Admin session expired.",
      },
      { status: 401 },
    );
  }

  let json: unknown;

  try {
    json =
      await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const parsed =
    requestSchema.safeParse(
      json,
    );

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error:
          "Invalid request.",
        issues:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result =
      await orchestrator.execute({
        sessionId:
          parsed.data.sessionId,
        userId:
          "admin-ui",
        channel: "test",
        message:
          parsed.data.message,
      });

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/ui/chat failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          "The AI service could not complete the request.",
        details:
          process.env.NODE_ENV ===
          "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : undefined,
      },
      { status: 502 },
    );
  }
}
