import {
  createMockConversationService,
} from "@/core/ai-platform/providers/mock/mock-conversation-environment";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

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

  const {
    id,
  } = await context.params;

  const service =
    createMockConversationService();

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
}
