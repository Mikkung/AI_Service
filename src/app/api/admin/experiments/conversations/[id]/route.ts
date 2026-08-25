import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import {
  conversationRouteError,
  requireConversationExperimentApiKey,
} from "../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  const {
    id,
  } = await context.params;

  try {
    const {
      service,
    } =
      createProductionConversationEnvironment();
    const conversation =
      await service.getConversation(id);

    if (!conversation) {
      return Response.json(
        {
          ok: false,
          error:
            "Conversation not found",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}
