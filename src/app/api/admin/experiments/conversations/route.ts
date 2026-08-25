import { z } from "zod";

import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import {
  conversationRouteError,
  requireConversationExperimentApiKey,
} from "./route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  channel: z.enum([
    "web",
    "line",
    "facebook",
    "teams",
  ]),
  channelUserId: z
    .string()
    .trim()
    .min(1)
    .max(200),
  metadata: z
    .record(
      z.string(),
      z.unknown(),
    )
    .optional(),
});

export async function POST(
  request: Request,
) {
  const unauthorized =
    requireConversationExperimentApiKey(
      request,
    );

  if (unauthorized) {
    return unauthorized;
  }

  const parsed =
    createSchema.safeParse(
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

  try {
    const {
      service,
    } =
      createProductionConversationEnvironment();
    const conversation =
      await service.createConversation(
        parsed.data,
      );

    return Response.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}

export async function GET(
  request: Request,
) {
  const unauthorized =
    requireConversationExperimentApiKey(
      request,
    );

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const {
      conversationRepository,
    } =
      createProductionConversationEnvironment();
    const conversations =
      await conversationRepository
        .listConversations();

    return Response.json({
      ok: true,
      conversations,
    });
  } catch (error) {
    return conversationRouteError(error);
  }
}
