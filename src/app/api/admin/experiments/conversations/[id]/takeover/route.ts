import { z } from "zod";

import {
  createMockConversationService,
} from "@/core/ai-platform/providers/mock/mock-conversation-environment";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

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

  const service =
    createMockConversationService();

  try {
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
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown takeover error",
      },
      {
        status: 400,
      },
    );
  }
}
