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

const takeoverSchema = z.object({
  agentId: z
    .string()
    .trim()
    .min(1)
    .max(200),
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
    takeoverSchema.safeParse(
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
      await service.takeOverConversation({
        conversationId: id,
        agentId:
          parsed.data.agentId,
      });

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}
