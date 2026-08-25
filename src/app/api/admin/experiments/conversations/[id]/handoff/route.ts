import { z } from "zod";

import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import {
  conversationRouteError,
  requireConversationExperimentApiKey,
} from "../../route-utils";

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
  const unauthorized =
    requireConversationExperimentApiKey(
      request,
    );

  if (unauthorized) {
    return unauthorized;
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

  try {
    const {
      service,
    } =
      createProductionConversationEnvironment();
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
    return conversationRouteError(error);
  }
}
