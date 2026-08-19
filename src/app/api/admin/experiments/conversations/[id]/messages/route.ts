import { z } from "zod";

import {
  createMockConversationService,
} from "@/core/ai-platform/providers/mock/mock-conversation-environment";

import {
  hasValidApiKey,
} from "@/lib/http/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(4000),
  scenario: z
    .enum([
      "grounded",
      "unsupported",
      "missing_citation",
    ])
    .default("grounded"),
  channelMessageId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional(),
  metadata: z
    .record(
      z.string(),
      z.unknown(),
    )
    .optional(),
});

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
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
    messageSchema.safeParse(
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
    createMockConversationService(
      parsed.data.scenario,
    );

  try {
    const result =
      await service.receiveUserMessage({
        conversationId: id,
        text:
          parsed.data.text,
        channelMessageId:
          parsed.data
            .channelMessageId,
        metadata:
          parsed.data.metadata,
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
            : "Unknown conversation error",
      },
      {
        status: 400,
      },
    );
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
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

  const messages =
    await service.listMessages(id);

  return Response.json({
    ok: true,
    messages,
  });
}
