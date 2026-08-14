import { z } from "zod";

import {
  FirestoreAdminAiRepository,
} from "@/infrastructure/repositories/firestore-admin-ai-repository";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200).optional(),
  messageId: z.string().trim().min(1).max(200).optional(),
  channel: z.string().trim().min(1).max(50).optional(),
  question: z.string().trim().min(1).max(4_000),
  aiAnswer: z.string().trim().min(1).max(12_000),
  rating: z.enum(["positive", "negative"]),
  reason: z
    .enum([
      "incorrect_fact",
      "incomplete",
      "unclear",
      "wrong_source",
      "tone",
      "other",
    ])
    .optional(),
  correctedAnswer: z.string().trim().max(12_000).optional(),
  adminNote: z.string().trim().max(4_000).optional(),
  requestedForKnowledge: z.boolean().default(false),
  submittedBy: z.string().trim().max(200).optional(),
  sourceIds: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
});

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
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
      {
        ok: false,
        error: "Invalid request.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (
    parsed.data.rating === "negative" &&
    parsed.data.requestedForKnowledge &&
    !parsed.data.correctedAnswer
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "correctedAnswer is required when requesting a negative correction for knowledge review.",
      },
      { status: 400 },
    );
  }

  try {
    const repository = new FirestoreAdminAiRepository();
    const feedback = await repository.createAnswerFeedback(parsed.data);

    return Response.json({
      ok: true,
      feedback,
      knowledgeUpdated: false,
      message:
        "Feedback saved for review. It has not been added to RAG knowledge automatically.",
    });
  } catch (error) {
    console.error("Answer feedback save failed", error);

    const message =
      error instanceof Error ? error.message : "Unknown feedback error";

    return Response.json(
      {
        ok: false,
        error: "Could not save AI feedback.",
        details:
          process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
