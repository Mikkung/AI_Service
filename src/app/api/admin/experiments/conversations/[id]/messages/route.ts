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

const messageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(4000),
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
  const unauthorized =
    requireConversationExperimentApiKey(
      request,
    );

  if (unauthorized) {
    return unauthorized;
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

  try {
    const {
      service,
    } =
      createProductionConversationEnvironment();
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
    return conversationRouteError(error);
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
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

  const {
    service,
  } =
    createProductionConversationEnvironment();

  try {
    const messages =
      await service.listMessages(id);

    return Response.json({
      ok: true,
      messages,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}
