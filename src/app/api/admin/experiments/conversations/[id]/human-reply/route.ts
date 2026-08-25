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

const replySchema = z.object({
  agentId: z
    .string()
    .trim()
    .min(1)
    .max(200),
  text: z
    .string()
    .trim()
    .min(1)
    .max(4000),
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
    replySchema.safeParse(
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
      await service.sendHumanReply({
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
