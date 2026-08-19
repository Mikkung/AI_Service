import { z } from "zod";

import {
  createMockConversationService,
} from "@/core/ai-platform/providers/mock/mock-conversation-environment";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handoffSchema = z.object({
  requestedBy: z
    .enum([
      "user",
      "ai",
      "staff",
      "system",
    ])
    .default("user"),
  reason: z
    .enum([
      "user_requested_human",
      "knowledge_not_found",
      "missing_citation",
      "provider_error",
      "low_confidence",
      "safety_escalation",
      "staff_requested",
      "other",
    ])
    .default("user_requested_human"),
  metadata: z
    .record(
      z.string(),
      z.unknown(),
    )
    .optional(),
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  if (!hasValidApiKey(request)) {
    return Response.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const parsed =
    handoffSchema.safeParse(
      await request.json(),
    );

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Invalid request",
        issues:
          parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const {
    id,
  } = await context.params;

  const service =
    createMockConversationService();

  try {
    const result =
      await service.requestHumanHandoff({
        conversationId: id,
        ...parsed.data,
      });

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown handoff error",
      },
      {
        status: 400,
      },
    );
  }
}
