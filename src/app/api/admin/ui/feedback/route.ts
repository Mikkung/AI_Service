import {
  z,
} from "zod";

import {
  FirestoreAdminAiRepository,
} from "@/infrastructure/repositories/firestore-admin-ai-repository";

import {
  hasValidAdminUiSession,
} from "@/lib/http/admin-ui-session";

export const runtime = "nodejs";
export const dynamic =
  "force-dynamic";

const repository =
  new FirestoreAdminAiRepository();

const requestSchema = z.object({
  sessionId:
    z.string().uuid().optional(),
  question:
    z.string()
      .trim()
      .min(1)
      .max(4_000),
  aiAnswer:
    z.string()
      .trim()
      .min(1)
      .max(12_000),
  rating:
    z.enum([
      "positive",
      "negative",
    ]),
  reason:
    z.enum([
      "incorrect_fact",
      "incomplete",
      "unclear",
      "wrong_source",
      "tone",
      "other",
    ]).optional(),
  correctedAnswer:
    z.string()
      .trim()
      .min(1)
      .max(12_000)
      .optional(),
  adminNote:
    z.string()
      .trim()
      .max(4_000)
      .optional(),
  requestedForKnowledge:
    z.boolean()
      .default(false),
  sourceIds:
    z.array(
      z.string()
        .trim()
        .min(1),
    )
      .max(20)
      .optional(),
});

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
          "Invalid feedback.",
        issues:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const feedback =
      await repository
        .createAnswerFeedback({
          sessionId:
            parsed.data.sessionId,
          channel: "test",
          question:
            parsed.data.question,
          aiAnswer:
            parsed.data.aiAnswer,
          rating:
            parsed.data.rating,
          reason:
            parsed.data.reason,
          correctedAnswer:
            parsed.data.correctedAnswer,
          adminNote:
            parsed.data.adminNote,
          requestedForKnowledge:
            parsed.data
              .requestedForKnowledge,
          submittedBy:
            "admin-ui",
          sourceIds:
            parsed.data.sourceIds,
        });

    return Response.json({
      ok: true,
      feedback,
      knowledgeUpdated: false,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/ui/feedback failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          "Could not save feedback.",
        details:
          process.env.NODE_ENV ===
          "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : undefined,
      },
      { status: 500 },
    );
  }
}
